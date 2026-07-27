import type { Hex } from "viem";

export interface MarketData {
  marketType: number;
  startTimestamp: bigint;
  expirationTimestamp: bigint;
  settled: boolean;
  outcome: boolean;
  referenceValue: bigint;
  feedId: Hex;
  startPrice: bigint;
  latitude: bigint;
  longitude: bigint;
  rainThresholdMmE2: bigint;
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

export function formatRainMm(rainMmE2: bigint): string {
  return (Number(rainMmE2) / 100).toFixed(2);
}

export function formatCoordinate(value: bigint): string {
  return (Number(value) / 1e6).toFixed(4);
}
