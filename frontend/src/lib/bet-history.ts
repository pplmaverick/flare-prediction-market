import type { Address, Hex } from "viem";

// Local, per-browser record of "I placed an encrypted bet on this market" —
// not read from chain. The bet's side/amount are private (TEE-only) and its
// on-chain trace is just an event + tx hash, so the simplest honest way to
// show "your position" is to remember the tx hash from the moment the wallet
// signed it. This does not sync across devices/browsers.
const EVENT_NAME = "flare-pm:bet-recorded";

function storageKey(marketId: number, address: Address): string {
  return `flare-pm:bet:${marketId.toString()}:${address.toLowerCase()}`;
}

export interface BetRecord {
  txHash: Hex;
  placedAt: number; // unix seconds
}

export function recordBetPlaced(marketId: number, address: Address, txHash: Hex): void {
  const record: BetRecord = { txHash, placedAt: Math.floor(Date.now() / 1000) };
  window.localStorage.setItem(storageKey(marketId, address), JSON.stringify(record));
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { marketId, address } }));
}

export function getBetRecord(marketId: number, address: Address): BetRecord | null {
  const raw = window.localStorage.getItem(storageKey(marketId, address));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BetRecord;
  } catch {
    return null;
  }
}

export function onBetRecorded(callback: () => void): () => void {
  window.addEventListener(EVENT_NAME, callback);
  return () => window.removeEventListener(EVENT_NAME, callback);
}
