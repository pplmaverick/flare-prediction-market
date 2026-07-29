import fs from 'fs';
import path from 'path';
import axios from 'axios';
import express from 'express';
import { AbiCoder, Wallet, keccak256, getBytes, toUtf8Bytes, concat } from 'ethers';
import * as eccrypto from 'eccrypto';
import type { Ecies } from 'eccrypto';
import { getPrivateKey, getPublicKey } from './keys';

// tee-proxy expects a TEE node to POLL its internal port, not the other way
// around: POST /queue/{main|direct} to dequeue, POST /result to answer.
// (See internal/server/internal.go + internal/queue/queue.go in the public
// flare-foundation/tee-proxy repo — there is no GET /info / POST /action on
// this side at all; that was the fce-weather-insurance-era shape, which this
// proxy generation replaced.)
const PROXY_INTERNAL = 'http://localhost:6661';
const POLL_INTERVAL_MS = 500;

if (process.env.SIMULATED_TEE !== 'true') {
  console.warn(
    '[warn] SIMULATED_TEE is not "true" in the environment — this server IS a simulation ' +
      'and should never be pointed at by production config.'
  );
}

const abiCoder = AbiCoder.defaultAbiCoder();

// Same secp256k1 keypair for ECIES decryption and ActionResult signing — see
// keys.ts. A real TEE keeps MachineData.PublicKey and TeeInfo.PublicKey as two
// distinct keys; we reuse one, and the proxy pins whichever key signs the
// bootstrap TEE_INFO result as `teeID` for every result after it (see
// internal/service/result's recoverSigner + SetIdentity), so they must match.
const signingWallet = new Wallet('0x' + getPrivateKey().toString('hex'));

const pubKeyBuf = getPublicKey(); // 65 bytes: 0x04 || X(32) || Y(32)
const pubKeyX = '0x' + pubKeyBuf.subarray(1, 33).toString('hex');
const pubKeyY = '0x' + pubKeyBuf.subarray(33, 65).toString('hex');

// --- op.Type/op.Command hashing --------------------------------------------
// go-flare-common's op.Type.Hash()/op.Command.Hash() right-pad the ASCII bytes
// to 32 bytes — the exact same encoding as Solidity's `bytes32("STRING")`
// literal, NOT keccak256. Our contract's OP_TYPE_PREDICTION_MARKET /
// OP_COMMAND_* constants use that same scheme, so they compare directly.
function opHash(s: string): string {
  const buf = Buffer.alloc(32);
  Buffer.from(s, 'utf8').copy(buf);
  return '0x' + buf.toString('hex');
}
function sameHash(a: string, b: string): boolean {
  return a?.toLowerCase() === b?.toLowerCase();
}

const OP_GET = opHash('F_GET');
const OP_TEE_INFO = opHash('TEE_INFO');
const OP_PREDICTION_MARKET = opHash('PREDICTION_MARKET');
const OP_DEPOSIT = opHash('DEPOSIT');
const OP_PLACE_BET = opHash('PLACE_BET');
const OP_SETTLE = opHash('SETTLE');
const OP_WITHDRAW = opHash('WITHDRAW');

// --- ECIES wire format --------------------------------------------------
// eccrypto.encrypt()/decrypt() operate on a 4-field object; on-chain we only
// have room for one `bytes` blob, so we concatenate as:
//   iv (16) || ephemPublicKey (65) || mac (32) || ciphertext (rest)
const IV_LEN = 16;
const EPHEM_PUBKEY_LEN = 65;
const MAC_LEN = 32;

export function serializeEcies(e: Ecies): string {
  return '0x' + Buffer.concat([e.iv, e.ephemPublicKey, e.mac, e.ciphertext]).toString('hex');
}

export function deserializeEcies(hex: string): Ecies {
  const buf = Buffer.from(hex.replace(/^0x/, ''), 'hex');
  const iv = buf.subarray(0, IV_LEN);
  const ephemPublicKey = buf.subarray(IV_LEN, IV_LEN + EPHEM_PUBKEY_LEN);
  const mac = buf.subarray(IV_LEN + EPHEM_PUBKEY_LEN, IV_LEN + EPHEM_PUBKEY_LEN + MAC_LEN);
  const ciphertext = buf.subarray(IV_LEN + EPHEM_PUBKEY_LEN + MAC_LEN);
  return { iv, ephemPublicKey, mac, ciphertext };
}

async function decryptPayload(hex: string): Promise<Buffer> {
  return eccrypto.decrypt(getPrivateKey(), deserializeEcies(hex));
}

// --- in-memory bet ledger ------------------------------------------------
interface Bet {
  bettor: string;
  isUp: boolean;
  amount: string;
}
const betLedger = new Map<string, Bet[]>();

// --- in-memory user balance ledger ---------------------------------------
interface UserBalance {
  available: bigint;
  locked: bigint;
}
const balanceLedger = new Map<string, UserBalance>();

function getBalance(address: string): UserBalance {
  return balanceLedger.get(address.toLowerCase()) ?? { available: 0n, locked: 0n };
}
function setBalance(address: string, bal: UserBalance): void {
  balanceLedger.set(address.toLowerCase(), bal);
}

// --- ledger persistence ---------------------------------------------------
// Simple JSON snapshot on disk so balances/bets survive a restart. Not a
// durable store — last writer wins, no locking — good enough for this
// simulated TEE's dev/test usage.
const LEDGER_PATH = path.join(__dirname, '..', 'data', 'ledger.json');

interface LedgerSnapshot {
  balances: [string, { available: string; locked: string }][];
  bets: [string, Bet[]][];
}

function saveLedger(): void {
  const snapshot: LedgerSnapshot = {
    balances: Array.from(balanceLedger.entries()).map(([address, bal]) => [
      address,
      { available: bal.available.toString(), locked: bal.locked.toString() },
    ]),
    bets: Array.from(betLedger.entries()),
  };
  try {
    fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
    fs.writeFileSync(LEDGER_PATH, JSON.stringify(snapshot, null, 2));
  } catch (err) {
    console.error('[ledger] failed to save', err);
  }
}

function loadLedger(): void {
  if (!fs.existsSync(LEDGER_PATH)) return;
  try {
    const raw = fs.readFileSync(LEDGER_PATH, 'utf8');
    const snapshot: LedgerSnapshot = JSON.parse(raw);
    for (const [address, bal] of snapshot.balances ?? []) {
      balanceLedger.set(address, { available: BigInt(bal.available), locked: BigInt(bal.locked) });
    }
    for (const [marketId, bets] of snapshot.bets ?? []) {
      betLedger.set(marketId, bets);
    }
    console.log(
      `[ledger] loaded ${balanceLedger.size} balance(s), ${betLedger.size} market(s) from ${LEDGER_PATH}`
    );
  } catch (err) {
    console.error('[ledger] failed to load', err);
  }
}

// --- ActionResult signing ---------------------------------------------------
// Mirrors tee-node's types.ActionResult.Hash():
//   keccak256( keccak256(Data) || ID || keccak256(SubmissionTag) || Status )
// then EIP-191 personal-sign over that hash (tee-proxy's recoverSigner does
// accounts.TextHash(result.Hash()) + ecrecover, matching ethers signMessage).
interface ActionResult {
  id: string;
  submissionTag: string;
  status: number;
  log: string;
  opType: string;
  opCommand: string;
  additionalResultStatus: string;
  version: string;
  data: string;
}

function actionResultHash(result: ActionResult): string {
  const dataHash = keccak256(result.data || '0x');
  const idBytes = getBytes(result.id);
  const tagHash = keccak256(toUtf8Bytes(result.submissionTag));
  const statusByte = Uint8Array.of(result.status);
  return keccak256(concat([dataHash, idBytes, tagHash, statusByte]));
}

// ethers returns v=27 or 28 (personal_sign convention); go-ethereum's
// crypto.SigToPub (tee-proxy's recoverSigner) expects the raw recovery id 0/1.
// Every signature we hand to the proxy must go through this.
function normalizeV(sig: string): string {
  const bytes = Buffer.from(sig.slice(2), 'hex');
  const v = bytes[bytes.length - 1];
  if (v === 27 || v === 28) {
    bytes[bytes.length - 1] = v - 27;
  }
  return '0x' + bytes.toString('hex');
}

async function postResult(result: ActionResult): Promise<void> {
  const signature = normalizeV(await signingWallet.signMessage(getBytes(actionResultHash(result))));
  try {
    await axios.post(`${PROXY_INTERNAL}/result`, {
      result,
      signature,
      proxySignature: '0x', // the proxy fills this in itself
    });
    console.log(
      `[result] posted id=${result.id} opCommand=${result.opCommand} status=${result.status}`
    );
  } catch (err) {
    const detail = axios.isAxiosError(err) ? err.response?.data ?? err.message : err;
    console.error('[result] POST /result failed:', detail);
  }
}

function buildResult(
  action: any,
  opType: string,
  opCommand: string,
  dataHex: string,
  status = 1,
  log = 'ok'
): ActionResult {
  return {
    id: action.data.id,
    submissionTag: action.data.submissionTag,
    status,
    log,
    opType,
    opCommand,
    additionalResultStatus: '0x',
    version: '',
    data: dataHex,
  };
}

// --- TEE_INFO bootstrap handshake -------------------------------------------
// tee-proxy enqueues this to `direct` on startup with a fresh block-hash
// challenge and PANICS if TeeInfo.Challenge doesn't echo back exactly.
// Before SetIdentity, the proxy accepts a /result for TEE_INFO without
// verifying its signature (internal/service/result.ProcessAndStore) — but the
// address recovered from THIS submission's signature is what parseTeeID()
// derives from TeeInfo.PublicKey and pins forever after, so it must be the
// same key we sign every later result with.
async function handleTeeInfo(action: any, requestMessageHex: string): Promise<void> {
  const reqBytes = Buffer.from(requestMessageHex.replace(/^0x/, ''), 'hex');
  // types.TeeInfoRequest has no json tag on Challenge -> Go's default
  // capitalized field name is used on the wire.
  const req = JSON.parse(reqBytes.toString('utf8')) as { Challenge: string };
  const challenge = req.Challenge;

  const zeroHash = '0x' + '00'.repeat(32);

  const teeInfo = {
    challenge,
    publicKey: { x: pubKeyX, y: pubKeyY },
    initialSigningPolicyId: 0,
    initialSigningPolicyHash: zeroHash,
    lastSigningPolicyId: 0,
    lastSigningPolicyHash: zeroHash,
    state: {
      systemState: '0x',
      systemStateVersion: zeroHash,
      state: '0x',
      stateVersion: zeroHash,
    },
    teeTimestamp: Math.floor(Date.now() / 1000),
  };

  const machineData = {
    extensionId: zeroHash,
    initialOwner: signingWallet.address,
    codeHash: zeroHash,
    platform: zeroHash,
    publicKey: { x: pubKeyX, y: pubKeyY },
  };

  // Not independently re-verified anywhere when attestation is disabled
  // (pkg/attestation.Verify short-circuits to nil) — signed on a best-effort
  // basis so the field is at least well-formed. Normalized the same way as
  // ActionResponse.Signature in case anything downstream ever recovers it
  // with go-ethereum's crypto.SigToPub instead of ecrecover.
  const dataSignature = normalizeV(
    await signingWallet.signMessage(getBytes(keccak256(toUtf8Bytes(JSON.stringify(teeInfo)))))
  );

  const teeInfoResponse = { teeInfo, machineData, dataSignature, attestation: '' };
  const dataHex = '0x' + Buffer.from(JSON.stringify(teeInfoResponse), 'utf8').toString('hex');

  console.log(`[TEE_INFO] answering bootstrap challenge=${challenge}`);
  await postResult(buildResult(action, OP_GET, OP_TEE_INFO, dataHex));
}

// --- PREDICTION_MARKET commands ---------------------------------------------
async function handlePredictionMarket(
  action: any,
  opCommand: string,
  messageHex: string
): Promise<void> {
  if (sameHash(opCommand, OP_DEPOSIT)) {
    const [depositor, amount] = abiCoder.decode(['address', 'uint256'], messageHex);
    console.log(`[DEPOSIT] depositor=${depositor} amount=${amount.toString()}`);
    const bal = getBalance(depositor);
    bal.available += amount;
    setBalance(depositor, bal);
    saveLedger();
    await postResult(buildResult(action, OP_PREDICTION_MARKET, opCommand, '0x'));
    return;
  }

  if (sameHash(opCommand, OP_PLACE_BET)) {
    // (address bettor, uint256 marketId, bytes encryptedBet) — mirrors the
    // contract's PlaceBetMessage; only encryptedBet is ECIES ciphertext.
    const [bettor, marketId, encryptedBet] = abiCoder.decode(
      ['address', 'uint256', 'bytes'],
      messageHex
    );
    const plaintext = await decryptPayload(encryptedBet);
    const [isUp, amount] = abiCoder.decode(['bool', 'uint256'], plaintext);
    console.log(
      `[PLACE_BET] market=${marketId} bettor=${bettor} isUp=${isUp} amount=${amount.toString()}`
    );

    const bal = getBalance(bettor);
    if (bal.available < amount) {
      console.warn(
        `[PLACE_BET] rejected: bettor=${bettor} available=${bal.available} amount=${amount}`
      );
      await postResult(
        buildResult(action, OP_PREDICTION_MARKET, opCommand, '0x', 0, 'insufficient available balance')
      );
      return;
    }
    bal.available -= amount;
    bal.locked += amount;
    setBalance(bettor, bal);

    const key = marketId.toString();
    const bets = betLedger.get(key) ?? [];
    bets.push({ bettor, isUp, amount: amount.toString() });
    betLedger.set(key, bets);
    saveLedger();
    await postResult(buildResult(action, OP_PREDICTION_MARKET, opCommand, '0x'));
    return;
  }

  if (sameHash(opCommand, OP_SETTLE)) {
    const [marketId, outcome, referenceValue] = abiCoder.decode(
      ['uint256', 'bool', 'uint256'],
      messageHex
    );
    const bets = betLedger.get(marketId.toString()) ?? [];
    console.log(
      `[SETTLE] market=${marketId} outcome=${outcome} referenceValue=${referenceValue} bets=${bets.length}`
    );

    let totalPool = 0n;
    let winnerPool = 0n;
    for (const bet of bets) {
      const amount = BigInt(bet.amount);
      totalPool += amount;
      if (bet.isUp === outcome) winnerPool += amount;
    }
    // winnerPool can be 0 (no bets landed on the winning side) — skip payout
    // division in that case; losers' locked amounts still get released below.
    for (const bet of bets) {
      const amount = BigInt(bet.amount);
      const bal = getBalance(bet.bettor);
      bal.locked -= amount;
      if (bet.isUp === outcome && winnerPool > 0n) {
        bal.available += (amount * totalPool) / winnerPool;
      }
      setBalance(bet.bettor, bal);
    }
    saveLedger();

    const resultData = abiCoder.encode(
      ['uint256', 'bool', 'uint256'],
      [marketId, outcome, referenceValue]
    );
    await postResult(buildResult(action, OP_PREDICTION_MARKET, opCommand, resultData));
    return;
  }

  if (sameHash(opCommand, OP_WITHDRAW)) {
    const [requester, amount, to] = abiCoder.decode(
      ['address', 'uint256', 'address'],
      messageHex
    );
    console.log(`[WITHDRAW] requester=${requester} amount=${amount.toString()} to=${to}`);

    const bal = getBalance(requester);
    if (bal.available < amount) {
      console.warn(
        `[WITHDRAW] rejected: requester=${requester} available=${bal.available} amount=${amount}`
      );
      await postResult(
        buildResult(action, OP_PREDICTION_MARKET, opCommand, '0x', 0, 'insufficient available balance')
      );
      return;
    }
    bal.available -= amount;
    setBalance(requester, bal);
    saveLedger();

    await postResult(buildResult(action, OP_PREDICTION_MARKET, opCommand, '0x'));
    return;
  }

  console.warn(`[processAction] unhandled PREDICTION_MARKET opCommand=${opCommand}`);
}

// --- action dispatch ---------------------------------------------------
// action.data.message (hexutil.Bytes) is, for Direct-type actions, the raw
// UTF-8 JSON bytes of a DirectInstruction{opType, opCommand, message} — one
// more layer of hex-encoding than it looks, since DirectInstruction.message
// is itself hexutil.Bytes. Actions arriving via the real on-chain path
// (Type: Instruction, from the C-chain indexer rather than /direct or the
// proxy's own bootstrap) may use a different encoding we haven't verified yet.
async function processAction(action: any): Promise<void> {
  let instruction: { opType: string; opCommand: string; message: string };
  try {
    const raw = Buffer.from(String(action.data.message).replace(/^0x/, ''), 'hex');
    instruction = JSON.parse(raw.toString('utf8'));
  } catch (err) {
    console.error('[processAction] could not parse DirectInstruction from action.data.message', err);
    return;
  }

  if (sameHash(instruction.opType, OP_GET) && sameHash(instruction.opCommand, OP_TEE_INFO)) {
    await handleTeeInfo(action, instruction.message);
    return;
  }

  if (sameHash(instruction.opType, OP_PREDICTION_MARKET)) {
    await handlePredictionMarket(action, instruction.opCommand, instruction.message);
    return;
  }

  console.warn(
    `[processAction] unhandled opType=${instruction.opType} opCommand=${instruction.opCommand}`
  );
}

// --- polling loops ---------------------------------------------------------
async function pollQueue(queueID: 'direct' | 'main'): Promise<void> {
  let res;
  try {
    res = await axios.post(`${PROXY_INTERNAL}/queue/${queueID}`, {});
  } catch (err) {
    // Connection refused is expected if the proxy isn't up yet.
    if (axios.isAxiosError(err) && err.code === 'ECONNREFUSED') return;
    console.error(`[poll:${queueID}] request failed:`, axios.isAxiosError(err) ? err.message : err);
    return;
  }

  let data = res.data;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      // leave as-is
    }
  }
  if (data === null || data === undefined || data === '') return;

  console.log(`[poll:${queueID}] dequeued action id=${data?.data?.id}`);
  try {
    await processAction(data);
  } catch (err) {
    console.error(`[poll:${queueID}] processAction error:`, err);
  }
}

setInterval(() => {
  pollQueue('direct').catch((err) => console.error('[poll:direct] unexpected error:', err));
}, POLL_INTERVAL_MS);

setInterval(() => {
  pollQueue('main').catch((err) => console.error('[poll:main] unexpected error:', err));
}, POLL_INTERVAL_MS);

// --- HTTP API (balance query) -----------------------------------------------
// Unauthenticated by design for now — any caller who knows an address can
// read its available/locked balance. Deposit/withdraw amounts and bet
// direction are already public on-chain via events, so this doesn't expose
// materially new information, but it is the first place the live netted
// available/locked figure itself becomes queryable.
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const HTTP_PORT = 3002;

const app = express();

app.get('/balance', (req, res) => {
  const address = req.query.address;
  if (typeof address !== 'string' || !ADDRESS_RE.test(address)) {
    res.status(400).json({ error: 'address query param must be a 0x-prefixed 20-byte address' });
    return;
  }
  const bal = getBalance(address);
  res.json({
    address: address.toLowerCase(),
    available: bal.available.toString(),
    locked: bal.locked.toString(),
  });
});

app.listen(HTTP_PORT, () => {
  console.log(`[simulated-tee] balance API listening on port ${HTTP_PORT}`);
});

console.log('[simulated-tee] polling proxy at', PROXY_INTERNAL);
console.log('[simulated-tee] public key X:', pubKeyX);
console.log('[simulated-tee] public key Y:', pubKeyY);
console.log('[simulated-tee] signing address:', signingWallet.address);

loadLedger();
