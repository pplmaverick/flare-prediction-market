import type { Hex } from "viem";
import type { TeePublicKey } from "./ecies";

/**
 * The TEE's ECIES public key isn't derivable from `teeAddress` (an Ethereum
 * address is a one-way hash of the pubkey) and there's no verified public
 * endpoint in this repo to fetch it from at build time — the simulated
 * extension (extension/src/server.ts) prints it to its own console on boot.
 * Configure it via env once you have it; the UI shows a clear "not
 * configured" state anywhere betting is disabled without it.
 */
export function getTeePublicKey(): TeePublicKey | null {
  const x = process.env.NEXT_PUBLIC_TEE_PUBKEY_X as Hex | undefined;
  const y = process.env.NEXT_PUBLIC_TEE_PUBKEY_Y as Hex | undefined;
  if (!x || !y) return null;
  return { x, y };
}
