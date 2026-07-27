import type { Address, Hex } from "viem";
import { coston2 } from "./chain";
import { PREDICTION_MARKET_ADDRESS } from "./contract";

// Coston2's public JSON-RPC endpoint rejects `eth_getLogs` requests that
// include an `address` filter ("Missing or invalid parameters" — verified
// empirically 2026-07-27, independent of block range size). Blockscout's
// REST API v2 (same host as the block explorer already linked elsewhere in
// this app) serves the same log data, pre-decoded against the contract's
// verified ABI, and works reliably — used here instead of viem's getLogs.
const EXPLORER_BASE = coston2.blockExplorers.default.url;

interface BlockscoutLogParam {
  name: string;
  value: string;
}

interface BlockscoutLogItem {
  decoded?: {
    method_call: string;
    parameters: BlockscoutLogParam[];
  } | null;
  transaction_hash: Hex;
  block_timestamp: string;
}

interface BlockscoutLogsResponse {
  items: BlockscoutLogItem[];
  next_page_params: Record<string, string | number> | null;
}

/** Walks every `BetPlaced` log for the contract via Blockscout's paginated
 * API, calling `onMatch` for each one (decoded into a plain marketId/bettor
 * map). Stops early once `onMatch` returns `true`. Bounded to avoid runaway
 * pagination as activity grows. */
async function forEachBetPlacedLog(
  onMatch: (item: BlockscoutLogItem, params: { marketId: string; bettor: string }) => boolean | void
): Promise<void> {
  let url: string | null = `${EXPLORER_BASE}/api/v2/addresses/${PREDICTION_MARKET_ADDRESS}/logs`;
  const maxPages = 20;

  for (let page = 0; url && page < maxPages; page++) {
    const res: Response = await fetch(url);
    if (!res.ok) throw new Error(`Blockscout API returned ${res.status}`);
    const data: BlockscoutLogsResponse = await res.json();

    for (const item of data.items) {
      if (!item.decoded?.method_call.startsWith("BetPlaced(")) continue;
      const marketId = item.decoded.parameters.find((p) => p.name === "marketId")?.value;
      const bettor = item.decoded.parameters.find((p) => p.name === "bettor")?.value;
      if (marketId === undefined || bettor === undefined) continue;
      if (onMatch(item, { marketId, bettor }) === true) return;
    }

    if (data.next_page_params) {
      const qs = new URLSearchParams(
        Object.fromEntries(Object.entries(data.next_page_params).map(([k, v]) => [k, String(v)]))
      ).toString();
      url = `${EXPLORER_BASE}/api/v2/addresses/${PREDICTION_MARKET_ADDRESS}/logs?${qs}`;
    } else {
      url = null;
    }
  }
}

/** Counts `BetPlaced` events for a given marketId — bet existence is public
 * (on-chain), the side/amount stay private in the TEE. */
export async function fetchBetCountForMarket(marketId: number): Promise<number> {
  let count = 0;
  await forEachBetPlacedLog((_item, params) => {
    if (Number(params.marketId) === marketId) count++;
  });
  return count;
}

export interface UserBetInfo {
  txHash: Hex;
  timestamp: string;
}

/** Finds this address's (most recent) bet on a market, straight from chain —
 * works regardless of how or where the bet was placed (this frontend, a
 * script, a different browser/device), unlike a client-side record of "I
 * clicked the button just now". */
export async function fetchUserBetForMarket(marketId: number, bettor: Address): Promise<UserBetInfo | null> {
  const bettorLower = bettor.toLowerCase();
  let found: UserBetInfo | null = null;

  await forEachBetPlacedLog((item, params) => {
    if (Number(params.marketId) === marketId && params.bettor.toLowerCase() === bettorLower) {
      // Logs come back newest-first; the first match is the most recent bet.
      found = { txHash: item.transaction_hash, timestamp: item.block_timestamp };
      return true;
    }
  });

  return found;
}
