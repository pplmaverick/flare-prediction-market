import fs from 'fs';
import path from 'path';
import axios from 'axios';
import express from 'express';
import type { AxiosResponse } from 'axios';
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
const PROXY_INTERNAL = process.env.PROXY_INTERNAL_URL ?? 'http://localhost:6673';
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

// tee-proxy's recoverSigner doesn't verify ActionResult.Hash() directly — it
// wraps it in go-flare-common's signing.Payload{Prefix, ChainID, DataHash}
// (an abi-encoded (bytes32,uint256,bytes32) tuple, keccak256'd) before
// checking the signature. Same domain-separation scheme PredictionMarket.sol
// uses for SETTLE results. Omitting this wrapper is what was causing
// "verifying response signature: signature check fail" on every result,
// including the TEE_INFO bootstrap.
const PREFIX_TEE_ACTION_RESULT = opHash('TEE_ACTION_RESULT');
const CHAIN_ID = BigInt(process.env.CHAIN_ID ?? '114');

// PredictionMarket's own extensionId (contracts/src/PredictionMarket.sol
// _extensionId, storage slot 0 — read via `cast storage` since it has no
// public getter). Fixed for this deployed contract at
// 0x9C22c9F1954f2E1D7B305c0E2932edEBE713bDc3; only changes on redeploy.
// register() checks the caller/claim-back owner against THIS extension's
// registered owner — registering under extensionId 0 (nobody's) is what was
// causing OwnerNotAllowed.
const EXTENSION_ID = BigInt(process.env.EXTENSION_ID ?? '65749');
const EXTENSION_ID_HASH = '0x' + EXTENSION_ID.toString(16).padStart(64, '0');

function signedResultHash(result: ActionResult): string {
  const encoded = abiCoder.encode(
    ['bytes32', 'uint256', 'bytes32'],
    [PREFIX_TEE_ACTION_RESULT, CHAIN_ID, actionResultHash(result)]
  );
  return keccak256(encoded);
}

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

// ethers' SigningKey.sign() always encodes v as 27/28; go-ethereum's
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
  const signature = normalizeV(await signingWallet.signMessage(getBytes(signedResultHash(result))));
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

// tee-node's types.MachineData.DataHash() (pkg/types/tee.go): keccak256 of the
// abi-encoded IMachineManager.TeeMachineData struct — same field order as
// MachineManagerFacet.register's ABI.
const MACHINE_DATA_TUPLE =
  'tuple(uint256 extensionId, address initialOwner, bytes32 codeHash, bytes32 platform, tuple(bytes32 x, bytes32 y) publicKey, bytes32 governanceHash)';
const PREFIX_TEE_MACHINE_REGISTER = opHash('TEE_MACHINE_REGISTER');

// register-tee's fccutils.GetCodeHashAndPlatform (SIMULATED_TEE=true path)
// compares MachineData.CodeHash/.Platform against these exact hardcoded
// sentinels, not zero — a mismatch reverts registration before it ever
// reaches the chain.
const SIMULATED_CODE_HASH = '0x194844cf417dde867073e5ab7199fa4d21fd82b5dbe2bdea8b3d7fc18d10fdc2';
const SIMULATED_PLATFORM = opHash('TEST_PLATFORM');

const INITIAL_OWNER = process.env.INITIAL_OWNER ?? '';
const GOVERNANCE_SIGNERS = (process.env.GOVERNANCE_SIGNERS || INITIAL_OWNER)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const GOVERNANCE_THRESHOLD = BigInt(process.env.GOVERNANCE_THRESHOLD ?? '1');

// keccak256(abi.encode(address[] signers, uint256 threshold)) — the same
// value the contract stores as TeeMachineData.governanceHash (tee-node's
// types.GovernanceHash). Must match whatever set-governance registered
// on-chain, or register() reverts InvalidGovernanceHash.
function computeGovernanceHash(): string {
  return keccak256(abiCoder.encode(['address[]', 'uint256'], [GOVERNANCE_SIGNERS, GOVERNANCE_THRESHOLD]));
}

// --- TEE_INFO bootstrap handshake -------------------------------------------
// tee-proxy enqueues this to `direct` on startup with a fresh block-hash
// challenge and PANICS if TeeInfo.Challenge doesn't echo back exactly.
// Per tee-proxy's internal/service/info.updateInfo, the envelope signature
// check (via postResult/signedResultHash) recomputes its domain-separated
// payload as signing.Payload{TEE_ACTION_RESULT, result.TeeInfo.ChainID,
// ActionResult.Hash()} — the chainID comes from THIS response's own
// teeInfo.chainId field, not any proxy-side config, so it must be set here
// and match the CHAIN_ID postResult signs with, or verification silently
// recomputes against chainId=0 and fails.
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
    chainId: Number(CHAIN_ID),
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

  const governanceHash = computeGovernanceHash();

  const machineData = {
    extensionId: EXTENSION_ID_HASH,
    initialOwner: INITIAL_OWNER,
    codeHash: SIMULATED_CODE_HASH,
    platform: SIMULATED_PLATFORM,
    publicKey: { x: pubKeyX, y: pubKeyY },
    governanceHash,
  };

  const machineDataHash = keccak256(
    abiCoder.encode(
      [MACHINE_DATA_TUPLE],
      [[EXTENSION_ID, INITIAL_OWNER, SIMULATED_CODE_HASH, SIMULATED_PLATFORM, [pubKeyX, pubKeyY], governanceHash]]
    )
  );
  const signedMachineDataHash = keccak256(
    abiCoder.encode(['bytes32', 'uint256', 'bytes32'], [PREFIX_TEE_MACHINE_REGISTER, CHAIN_ID, machineDataHash])
  );
  const dataSignature = normalizeV(await signingWallet.signMessage(getBytes(signedMachineDataHash)));

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
  console.log('[DEBUG] action:', JSON.stringify(action, null, 2));

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

// --- on-chain balance scan (GET /balance) -----------------------------------
// Coston2's public JSON-RPC caps eth_getLogs to a 30-block range per call
// (verified empirically 2026-07-30: `requested too many blocks ... maximum is
// set to 30`) — scanning from the contract's deploy block (33308582) to the
// current chain height (~33.4M) would take thousands of chunked RPC calls,
// far too slow to redo on every cache expiry. Blockscout's REST API (same
// one frontend/src/lib/blockscout.ts's fetchVaultBalance already uses for
// this exact computation) serves the same decoded log data without that
// per-call block-range limit, so we scan through it instead of a direct
// JsonRpcProvider.getLogs.
const BLOCKSCOUT_BASE = 'https://coston2-explorer.flare.network';
const CONTRACT_ADDRESS = '0x9C22c9F1954f2E1D7B305c0E2932edEBE713bDc3';
const BALANCE_CACHE_MS = 30_000;

interface OnChainBalance {
  available: bigint;
  locked: bigint;
}

const onChainBalanceCache = new Map<string, { value: OnChainBalance; expiresAt: number }>();

interface BlockscoutLogParam {
  name: string;
  value: string;
}
interface BlockscoutLogItem {
  decoded?: { method_call: string; parameters: BlockscoutLogParam[] } | null;
}
interface BlockscoutLogsResponse {
  items: BlockscoutLogItem[];
  next_page_params: Record<string, string | number> | null;
}

// Walks every log for the contract via Blockscout's paginated API, netting
// DepositRequested (matched on `depositor`) against WithdrawalExecuted
// (matched on `to` — the event's only address field, and the one that
// determines where funds actually landed). `locked` can't be derived from
// events alone (it lives in TEE memory), so it's always reported as 0.
async function scanOnChainBalance(address: string): Promise<OnChainBalance> {
  const addressLower = address.toLowerCase();
  let deposited = 0n;
  let withdrawn = 0n;
  let url: string | null = `${BLOCKSCOUT_BASE}/api/v2/addresses/${CONTRACT_ADDRESS}/logs`;
  const maxPages = 50;

  for (let page = 0; url && page < maxPages; page++) {
    const res: AxiosResponse<BlockscoutLogsResponse> = await axios.get<BlockscoutLogsResponse>(url);
    const data: BlockscoutLogsResponse = res.data;

    for (const item of data.items) {
      const methodCall = item.decoded?.method_call;
      if (!methodCall) continue;

      if (methodCall.startsWith('DepositRequested(')) {
        const depositor = item.decoded?.parameters.find((p) => p.name === 'depositor')?.value;
        const amount = item.decoded?.parameters.find((p) => p.name === 'amount')?.value;
        if (depositor?.toLowerCase() === addressLower && amount !== undefined) {
          deposited += BigInt(amount);
        }
      } else if (methodCall.startsWith('WithdrawalExecuted(')) {
        const to = item.decoded?.parameters.find((p) => p.name === 'to')?.value;
        const amount = item.decoded?.parameters.find((p) => p.name === 'amount')?.value;
        if (to?.toLowerCase() === addressLower && amount !== undefined) {
          withdrawn += BigInt(amount);
        }
      }
    }

    if (data.next_page_params) {
      const qs: string = new URLSearchParams(
        Object.fromEntries(Object.entries(data.next_page_params).map(([k, v]) => [k, String(v)]))
      ).toString();
      url = `${BLOCKSCOUT_BASE}/api/v2/addresses/${CONTRACT_ADDRESS}/logs?${qs}`;
    } else {
      url = null;
    }
  }

  return { available: deposited - withdrawn, locked: 0n };
}

async function getOnChainBalance(address: string): Promise<OnChainBalance> {
  const key = address.toLowerCase();
  const now = Date.now();
  const cached = onChainBalanceCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }
  const value = await scanOnChainBalance(address);
  onChainBalanceCache.set(key, { value, expiresAt: now + BALANCE_CACHE_MS });
  return value;
}

// --- HTTP API (balance query) -----------------------------------------------
// Unauthenticated by design for now — any caller who knows an address can
// read its available/locked balance. Deposit/withdraw amounts and bet
// direction are already public on-chain via events, so this doesn't expose
// materially new information, but it is the first place the live netted
// available/locked figure itself becomes queryable.
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const HTTP_PORT = 3002;

const app = express();

app.get('/balance', async (req, res) => {
  const address = req.query.address;
  if (typeof address !== 'string' || !ADDRESS_RE.test(address)) {
    res.status(400).json({ error: 'address query param must be a 0x-prefixed 20-byte address' });
    return;
  }
  try {
    const bal = await getOnChainBalance(address);
    res.json({
      address: address.toLowerCase(),
      available: bal.available.toString(),
      locked: bal.locked.toString(),
    });
  } catch (err) {
    console.error('[balance] on-chain scan failed:', axios.isAxiosError(err) ? err.message : err);
    res.status(502).json({ error: 'failed to scan on-chain balance' });
  }
});

app.listen(HTTP_PORT, () => {
  console.log(`[simulated-tee] balance API listening on port ${HTTP_PORT}`);
});

console.log('[simulated-tee] polling proxy at', PROXY_INTERNAL);
console.log('[simulated-tee] public key X:', pubKeyX);
console.log('[simulated-tee] public key Y:', pubKeyY);
console.log('[simulated-tee] signing address:', signingWallet.address);

loadLedger();
