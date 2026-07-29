"use client";

import Link from "next/link";
import { CloudRain, CurrencyCircleDollar, LockKey, TrendDown, TrendUp } from "@phosphor-icons/react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { useMarket, useNow, useBetCount, usePayTokenAddress, useErc20Meta } from "@/lib/hooks";
import {
  bucketRangeLabel,
  decodeFeedSymbol,
  formatCoordinate,
  getMarketStatus,
  isPriceMarket,
  isPriceUp,
  type MarketTypeFilter,
} from "@/lib/market";
import { findCityName, formatCountdown, formatTokenAmount, formatUnixTimestamp } from "@/lib/format";

export function MarketCard({
  marketId,
  typeFilter = "all",
}: {
  marketId: number;
  typeFilter?: MarketTypeFilter;
}) {
  const { data: market, isLoading, isError } = useMarket(marketId);
  const now = useNow();
  // Hooks must run unconditionally, before the loading/error early-returns below.
  const { data: betCount } = useBetCount(marketId);
  const { data: payToken } = usePayTokenAddress();
  const { decimals: payDecimals, symbol: paySymbol } = useErc20Meta(payToken);

  if (isLoading) {
    return (
      <Card className="h-44 animate-pulse">
        <CardContent className="p-5">
          <div className="h-4 w-24 rounded bg-surface-raised" />
          <div className="mt-4 h-6 w-40 rounded bg-surface-raised" />
          <div className="mt-6 h-4 w-32 rounded bg-surface-raised" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !market) {
    return (
      <Card className="border-destructive/30 p-5 text-sm text-destructive">
        Failed to load market #{marketId}
      </Card>
    );
  }

  const isPrice = isPriceMarket(market);
  if (typeFilter === "price" && !isPrice) return null;
  if (typeFilter === "weather" && isPrice) return null;

  const status = getMarketStatus(market, now);
  const cityName = !isPrice ? findCityName(market.latitude, market.longitude) : undefined;
  const totalPoolLabel =
    payDecimals !== undefined
      ? `${formatTokenAmount(market.totalPool, payDecimals)}${paySymbol ? ` ${paySymbol}` : ""}`
      : undefined;

  return (
    <Link href={`/market/${marketId}`}>
      <Card className="group h-full transition-all hover:border-primary/40 hover:shadow-primary/10">
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-raised text-primary">
              {isPrice ? <CurrencyCircleDollar size={20} weight="bold" /> : <CloudRain size={20} weight="bold" />}
            </span>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Market #{marketId}
              </p>
              <p className="font-mono text-sm font-semibold text-foreground">
                {isPrice ? decodeFeedSymbol(market.feedId) : (cityName ?? "Weather")}
              </p>
            </div>
          </div>
          <StatusBadge status={status} />
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {isPrice ? (
            <p className="text-sm text-muted-foreground">
              Settles <TrendUp className="inline text-accent" size={14} weight="bold" /> Up if price rises
              above start
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Lat {formatCoordinate(market.latitude)}, Lon {formatCoordinate(market.longitude)} ·{" "}
              {market.bucketThresholds.length + 1} temperature buckets
            </p>
          )}

          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {status === "open" ? "Closes in" : status === "settled" ? "Settled" : "Expired"}
            </span>
            <span className="font-mono tabular-nums text-foreground">
              {status === "settled"
                ? formatUnixTimestamp(Number(market.expirationTimestamp))
                : formatCountdown(Number(market.expirationTimestamp), now)}
            </span>
          </div>

          {totalPoolLabel && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Total pool</span>
              <span className="font-mono tabular-nums text-foreground">{totalPoolLabel}</span>
            </div>
          )}

          {market.settled ? (
            isPrice ? (
              <Badge variant={isPriceUp(market.winningBucket) ? "accent" : "destructive"} className="w-fit">
                {isPriceUp(market.winningBucket) ? (
                  <TrendUp size={12} weight="bold" />
                ) : (
                  <TrendDown size={12} weight="bold" />
                )}
                Outcome: {isPriceUp(market.winningBucket) ? "Yes / Up" : "No / Down"}
              </Badge>
            ) : (
              <Badge variant="accent" className="w-fit">
                <CloudRain size={12} weight="bold" />
                {bucketRangeLabel(market.bucketThresholds, market.winningBucket)}
              </Badge>
            )
          ) : (
            <Badge variant="confidential" className="w-fit">
              <LockKey size={12} weight="bold" />
              Bets encrypted (TEE)
            </Badge>
          )}
          {betCount !== undefined && (
            <p className="text-xs text-muted-foreground">
              {betCount} {betCount === 1 ? "bet" : "bets"} placed
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
