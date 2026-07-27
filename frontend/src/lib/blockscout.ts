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
}

interface BlockscoutLogsResponse {
  items: BlockscoutLogItem[];
  next_page_params: Record<string, string | number> | null;
}

/** Counts `BetPlaced` events for a given marketId — bet existence is public
 * (on-chain), the side/amount stay private in the TEE. Paginates through
 * Blockscout's log listing for the contract (bounded to avoid runaway loops
 * as activity grows). */
export async function fetchBetCountForMarket(marketId: number): Promise<number> {
  let url: string | null = `${EXPLORER_BASE}/api/v2/addresses/${PREDICTION_MARKET_ADDRESS}/logs`;
  let count = 0;
  const maxPages = 20;

  for (let page = 0; url && page < maxPages; page++) {
    const res: Response = await fetch(url);
    if (!res.ok) throw new Error(`Blockscout API returned ${res.status}`);
    const data: BlockscoutLogsResponse = await res.json();

    for (const item of data.items) {
      if (!item.decoded?.method_call.startsWith("BetPlaced(")) continue;
      const marketIdParam = item.decoded.parameters.find((p) => p.name === "marketId");
      if (marketIdParam && Number(marketIdParam.value) === marketId) count++;
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

  return count;
}
