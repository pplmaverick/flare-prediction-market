import * as secp256k1 from "@noble/secp256k1";
import { sha512, sha256 as sha256Sync } from "@noble/hashes/sha2.js";
import { hmac } from "@noble/hashes/hmac.js";
import { encodeAbiParameters, type Hex } from "viem";

export interface TeePublicKey {
  x: Hex; // 32-byte X coordinate
  y: Hex; // 32-byte Y coordinate
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, "");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): Hex {
  return ("0x" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")) as Hex;
}

function concatBytes(...arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrs) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

function recipientPubKeyBytes(publicKey: TeePublicKey): Uint8Array {
  return concatBytes(new Uint8Array([0x04]), hexToBytes(publicKey.x), hexToBytes(publicKey.y));
}

// --- go-ethereum-compatible ECIES (ECIES_AES128_SHA256) ---------------------
//
// Verified byte-for-byte against the actual dependency chain a real TEE runs:
// tee-node's `/decrypt` endpoint (internal/extension/server.go) calls
// pkg/utils/crypto.go's `Decrypt()`, which wraps go-ethereum's
// `crypto/ecies` with `ecies.ECIES_AES128_SHA256` params — read directly out
// of `github.com/flare-foundation/tee-node@v0.0.23.../pkg/utils/crypto.go`
// and `github.com/ethereum/go-ethereum@v1.17.4/crypto/ecies/{params,ecies}.go`
// (2026-07-27). This is NOT the same scheme as the `eccrypto` npm package —
// see `eciesEncryptSimulated` below for that one.
//
// Wire format (go-ethereum's Encrypt): ephemPubKey(65, uncompressed) ||
// iv(16) || ciphertext(len(m)) || mac(32).
//
// Key derivation (go-ethereum's deriveKeys, NIST SP 800-56 concatKDF):
//   z          = 32-byte big-endian ECDH shared secret (X coordinate only)
//   K          = concatKDF(SHA-256, z, kdLen=32)   // s1 is always nil here
//   Ke         = K[0:16]                            // AES-128 key
//   Km         = SHA-256(K[16:32])                  // 32-byte HMAC key
// Encryption: AES-128-CTR(Ke, iv, plaintext) -> em = iv || ciphertext
// MAC: HMAC-SHA256(Km, em)                          // s2 is always nil here

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data as BufferSource));
}

async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, data as BufferSource));
}

async function aesCtrEncrypt(key: Uint8Array, iv: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey("raw", key as BufferSource, { name: "AES-CTR" }, false, [
    "encrypt",
  ]);
  // length: 128 -> the entire 16-byte IV is the incrementing counter block,
  // matching Go's crypto/cipher.NewCTR (whole-block big-endian counter).
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-CTR", counter: iv as BufferSource, length: 128 },
    cryptoKey,
    plaintext as BufferSource
  );
  return new Uint8Array(ciphertext);
}

async function concatKdf(z: Uint8Array, kdLen: number): Promise<Uint8Array> {
  const hashLen = 32; // SHA-256
  const chunks: Uint8Array[] = [];
  let produced = 0;
  for (let counter = 1; produced < kdLen; counter++) {
    const counterBytes = new Uint8Array(4);
    new DataView(counterBytes.buffer).setUint32(0, counter, false);
    const chunk = await sha256(concatBytes(counterBytes, z));
    chunks.push(chunk);
    produced += hashLen;
  }
  return concatBytes(...chunks).slice(0, kdLen);
}

async function deriveKeys(z: Uint8Array, keyLen: number): Promise<{ ke: Uint8Array; km: Uint8Array }> {
  const k = await concatKdf(z, 2 * keyLen);
  const ke = k.slice(0, keyLen);
  const kmPre = k.slice(keyLen, 2 * keyLen);
  const km = await sha256(kmPre);
  return { ke, km };
}

/**
 * ECIES-encrypts `plaintext` against a secp256k1 public key using the same
 * scheme the real tee-node decrypts with: go-ethereum's
 * `crypto/ecies.ECIES_AES128_SHA256` (AES-128-CTR, NIST concatKDF, HMAC-SHA256).
 * See the module doc comment above for how this was verified.
 */
export async function eciesEncrypt(publicKey: TeePublicKey, plaintext: Uint8Array): Promise<Hex> {
  const recipientPubBytes = recipientPubKeyBytes(publicKey);
  const keyLen = 16; // AES-128

  const ephemPrivateKey = secp256k1.utils.randomSecretKey();
  const ephemPublicKey = secp256k1.getPublicKey(ephemPrivateKey, false); // 65 bytes, uncompressed

  const sharedPoint = secp256k1.getSharedSecret(ephemPrivateKey, recipientPubBytes, true); // 33 bytes compressed
  const z = sharedPoint.slice(1, 33); // X coordinate only, big-endian, 32 bytes

  const { ke, km } = await deriveKeys(z, keyLen);

  const iv = crypto.getRandomValues(new Uint8Array(16));
  const ciphertext = await aesCtrEncrypt(ke, iv, plaintext);
  const em = concatBytes(iv, ciphertext);

  const mac = await hmacSha256(km, em);

  return bytesToHex(concatBytes(ephemPublicKey, em, mac));
}

/**
 * ABI-encodes `(bool isUp, uint256 amount)` and ECIES-encrypts it against the
 * real tee-node's decryption scheme (see `eciesEncrypt` above) — the
 * plaintext shape `processPlaceBet` (fce-extension-scaffold's
 * internal/extension/extension.go) decodes after calling the TEE's own
 * `/decrypt` endpoint.
 */
export async function encryptBet(publicKey: TeePublicKey, isUp: boolean, amountWei: bigint): Promise<Hex> {
  const plaintextHex = encodeAbiParameters([{ type: "bool" }, { type: "uint256" }], [isUp, amountWei]);
  return eciesEncrypt(publicKey, hexToBytes(plaintextHex));
}

// --- eccrypto-compatible ECIES (kept for local dev only) --------------------
//
// Reproduces the `eccrypto` npm package's wire format instead:
//   iv(16) || ephemeralPublicKey(65) || mac(32) || ciphertext
// This is what `flare-prediction-market/extension/src/server.ts`'s
// SIMULATED_TEE stub expects (AES-256-CBC, SHA-512 KDF split in half, MAC
// covers the ephemeral pubkey too) — a different, unrelated TEE stand-in from
// the real one this file's `eciesEncrypt` now targets. Not wired into any UI
// component; use it directly if testing against that stub instead.
export async function eciesEncryptSimulated(publicKey: TeePublicKey, plaintext: Uint8Array): Promise<Hex> {
  async function aesCbcEncrypt(iv: Uint8Array, key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
    const cryptoKey = await crypto.subtle.importKey("raw", key as BufferSource, { name: "AES-CBC" }, false, [
      "encrypt",
    ]);
    const ct = await crypto.subtle.encrypt({ name: "AES-CBC", iv: iv as BufferSource }, cryptoKey, data as BufferSource);
    return new Uint8Array(ct);
  }

  const recipientPubBytes = recipientPubKeyBytes(publicKey);

  const ephemPrivateKey = secp256k1.utils.randomSecretKey();
  const ephemPublicKey = secp256k1.getPublicKey(ephemPrivateKey, false);

  const sharedPoint = secp256k1.getSharedSecret(ephemPrivateKey, recipientPubBytes, true);
  const px = sharedPoint.slice(1, 33);

  const hash = sha512(px);
  const encryptionKey = hash.slice(0, 32);
  const macKey = hash.slice(32, 64);

  const iv = crypto.getRandomValues(new Uint8Array(16));
  const ciphertext = await aesCbcEncrypt(iv, encryptionKey, plaintext);

  const dataToMac = concatBytes(iv, ephemPublicKey, ciphertext);
  const mac = hmac(sha256Sync, macKey, dataToMac);

  return bytesToHex(concatBytes(iv, ephemPublicKey, mac, ciphertext));
}
