import type { Hex } from "viem";

export interface MarketData {
  marketType: number;
  startTimestamp: bigint;
  expirationTimestamp: bigint;
  settled: boolean;
  winningBucket: number; // PRICE: 1 = Up, 0 = Down. WEATHER: index into bucketThresholds.
  referenceValue: bigint; // signed — WEATHER's measured temperature can be negative
  feedId: Hex;
  startPrice: bigint;
  latitude: bigint;
  longitude: bigint;
  bucketThresholds: readonly bigint[]; // ascending °C x100 breakpoints; N thresholds -> N+1 buckets
  bucketPools: readonly bigint[]; // per-bucket pool, only populated after settlement
  totalPool: bigint;
}

export type MarketStatus = "open" | "awaiting_settlement" | "settled";

export function getMarketStatus(market: MarketData, nowSeconds: number): MarketStatus {
  if (market.settled) return "settled";
  if (nowSeconds >= Number(market.expirationTimestamp)) return "awaiting_settlement";
  return "open";
}

export function isPriceMarket(market: MarketData): boolean {
  return market.marketType === 0;
}

/** PRICE markets encode their winning side as bucket 0 = Down, 1 = Up (same wire shape as
 * WEATHER's bucket index — see PredictionMarket.sol's PlaceBetMessage). */
export function isPriceUp(winningBucket: number): boolean {
  return winningBucket === 1;
}

// Reverses encodeFeedId: category byte (1) + ASCII symbol, zero-padded to 21 bytes.
export function decodeFeedSymbol(feedId: Hex): string {
  const clean = feedId.replace(/^0x/, "");
  const bytes: number[] = [];
  for (let i = 2; i < clean.length; i += 2) {
    const byte = parseInt(clean.slice(i, i + 2), 16);
    if (byte === 0) break;
    bytes.push(byte);
  }
  return String.fromCharCode(...bytes) || "UNKNOWN/USD";
}

export function formatFtsoPrice(value: bigint, priceDecimals = 5): string {
  const divisor = 10 ** priceDecimals;
  return (Number(value) / divisor).toLocaleString("en-US", {
    maximumFractionDigits: priceDecimals > 2 ? 4 : priceDecimals,
  });
}

/** °C x100 (signed — WEATHER markets can measure sub-zero temperatures) -> one-decimal string. */
export function formatTemperatureC(temperatureCelsiusE2: bigint): string {
  return (Number(temperatureCelsiusE2) / 100).toFixed(1);
}

export function formatCoordinate(value: bigint): string {
  return (Number(value) / 1e6).toFixed(4);
}

/** Number of buckets a WEATHER market's thresholds define — N thresholds -> N+1 buckets. */
export function bucketCount(bucketThresholds: readonly bigint[]): number {
  return bucketThresholds.length + 1;
}

/** Human-readable °C range for bucket `index` (0-indexed) against ascending `bucketThresholds` —
 * mirrors PredictionMarket.sol's `_resolveBucket`: bucket 0 is "< thresholds[0]", the last bucket
 * is "> thresholds[N-1]", and bucket i in between is "thresholds[i-1]–thresholds[i]". */
export function bucketRangeLabel(bucketThresholds: readonly bigint[], index: number): string {
  const n = bucketThresholds.length;
  if (n === 0) return "—";
  if (index <= 0) return `< ${formatTemperatureC(bucketThresholds[0])}°C`;
  if (index >= n) return `> ${formatTemperatureC(bucketThresholds[n - 1])}°C`;
  return `${formatTemperatureC(bucketThresholds[index - 1])}–${formatTemperatureC(bucketThresholds[index])}°C`;
}
