import * as secp256k1 from "@noble/secp256k1";
import { sha512, sha256 } from "@noble/hashes/sha2.js";
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

async function aesCbcEncrypt(iv: Uint8Array, key: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey("raw", key as BufferSource, { name: "AES-CBC" }, false, [
    "encrypt",
  ]);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-CBC", iv: iv as BufferSource }, cryptoKey, plaintext as BufferSource);
  return new Uint8Array(ciphertext);
}

/**
 * ECIES-encrypts `plaintext` against a secp256k1 public key, reproducing the
 * "eccrypto" npm package's wire format byte-for-byte:
 *   iv(16) || ephemeralPublicKey(65, uncompressed) || mac(32) || ciphertext
 * This is exactly what extension/src/server.ts's `deserializeEcies` +
 * `eccrypto.decrypt` expect (see PLACE_BET handling there).
 *
 * Scope: this targets SIMULATED_TEE=true (extension/.env.example default).
 * A real attested TEE (tee-node's Go extension, not present in this repo)
 * decrypts with a different ECIES profile instead — AES-128-CTR keyed via a
 * NIST concat KDF, wired as ephemPubKey||iv||ciphertext||mac — documented in
 * the root README's "Implementation Notes" section. Swap this module for
 * that scheme before pointing the frontend at a real (non-simulated) TEE.
 */
export async function eciesEncrypt(publicKey: TeePublicKey, plaintext: Uint8Array): Promise<Hex> {
  const recipientPubBytes = concatBytes(
    new Uint8Array([0x04]),
    hexToBytes(publicKey.x),
    hexToBytes(publicKey.y)
  );

  const ephemPrivateKey = secp256k1.utils.randomSecretKey();
  const ephemPublicKey = secp256k1.getPublicKey(ephemPrivateKey, false); // 65 bytes, uncompressed

  const sharedPoint = secp256k1.getSharedSecret(ephemPrivateKey, recipientPubBytes, true); // 33 bytes compressed
  const px = sharedPoint.slice(1, 33); // X coordinate only, matches eccrypto's `derive`

  const hash = sha512(px);
  const encryptionKey = hash.slice(0, 32);
  const macKey = hash.slice(32, 64);

  const iv = crypto.getRandomValues(new Uint8Array(16));
  const ciphertext = await aesCbcEncrypt(iv, encryptionKey, plaintext);

  const dataToMac = concatBytes(iv, ephemPublicKey, ciphertext);
  const mac = hmac(sha256, macKey, dataToMac);

  return bytesToHex(concatBytes(iv, ephemPublicKey, mac, ciphertext));
}

/**
 * ABI-encodes `(bool isUp, uint256 amount)` and ECIES-encrypts it — the exact
 * plaintext shape `handlePredictionMarket`'s PLACE_BET branch decodes after
 * `eccrypto.decrypt` in extension/src/server.ts.
 */
export async function encryptBet(publicKey: TeePublicKey, isUp: boolean, amountWei: bigint): Promise<Hex> {
  const plaintextHex = encodeAbiParameters([{ type: "bool" }, { type: "uint256" }], [isUp, amountWei]);
  return eciesEncrypt(publicKey, hexToBytes(plaintextHex));
}
