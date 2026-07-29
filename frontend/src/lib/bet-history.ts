import type { Address } from "viem";

export type StoredMarketType = "PRICE" | "WEATHER";

export interface BetHistoryEntry {
  marketId: string;
  marketType: StoredMarketType;
  direction: string;
  bucketIndex: number;
  amount: string; // wei, as a decimal string (BigInt doesn't survive JSON.stringify)
  timestamp: number;
  txHash: string;
}

function storageKey(address: Address): string {
  return `bet-history-${address}`;
}

/** Reads this wallet's locally-recorded bet history — a client-side convenience log only, not a
 * source of truth (see lib/blockscout.ts's verifyBetOnChain, used by the My Bets page to confirm
 * each entry actually landed on-chain). Never throws: a corrupted or foreign localStorage value
 * just yields an empty list. */
export function readBetHistory(address: Address): BetHistoryEntry[] {
  try {
    const raw = localStorage.getItem(storageKey(address));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as BetHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

/** Appends one entry to this wallet's bet history in localStorage. */
export function appendBetHistory(address: Address, entry: BetHistoryEntry): void {
  const existing = readBetHistory(address);
  existing.push(entry);
  localStorage.setItem(storageKey(address), JSON.stringify(existing));
}
