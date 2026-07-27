"use client";

import type { ReactNode } from "react";
import { useParams } from "next/navigation";
import {
  CalendarBlank,
  CloudRain,
  CurrencyCircleDollar,
  Info,
  TrendDown,
  TrendUp,
} from "@phosphor-icons/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { PlaceBetDialog } from "@/components/place-bet-dialog";
import { YourPosition } from "@/components/your-position";
import { FinalizeSettlementPanel } from "@/components/finalize-settlement-panel";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useMarket, useFeedPrice, useNow } from "@/lib/hooks";
import {
  decodeFeedSymbol,
  formatCoordinate,
  formatFtsoPrice,
  formatRainMm,
  getMarketStatus,
  isPriceMarket,
} from "@/lib/market";
import { formatCountdown, formatUnixTimestamp } from "@/lib/format";

export default function MarketDetailPage() {
  const params = useParams<{ id: string }>();
  const marketId = Number(params.id);
  const { data: market, isLoading, isError } = useMarket(marketId);
  const now = useNow();
  // Hooks must run unconditionally on every render, so this is computed
  // before the loading/error early-returns below.
  const feedPrice = useFeedPrice(market && market.marketType === 0 ? market.feedId : undefined);

  if (isLoading) {
    return <div className="mx-auto max-w-4xl px-4 py-16 text-center text-muted-foreground">Loading market...</div>;
  }
  if (isError || !market) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center text-destructive">
        Could not load market #{marketId}.
      </div>
    );
  }

  const status = getMarketStatus(market, now);
  const isPrice = isPriceMarket(market);
  const priceDecimals = feedPrice.data?.[1] ?? 5;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-raised text-primary">
            {isPrice ? <CurrencyCircleDollar size={22} weight="bold" /> : <CloudRain size={22} weight="bold" />}
          </span>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Market #{marketId}</p>
            <h1 className="font-mono text-xl font-semibold text-foreground">
              {isPrice ? decodeFeedSymbol(market.feedId) : "Rainfall Market"}
            </h1>
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Market Details</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            <Row label="Type" value={isPrice ? "Price (FTSO)" : "Weather (FDC)"} />
            {isPrice ? (
              <>
                <Row label="Feed" value={decodeFeedSymbol(market.feedId)} mono />
                <Row label="Start price" value={`$${formatFtsoPrice(market.startPrice, priceDecimals)}`} mono />
                {feedPrice.data && (
                  <Row label="Live price" value={`$${formatFtsoPrice(feedPrice.data[0], priceDecimals)}`} mono accent />
                )}
                {market.settled && (
                  <Row label="Settlement price" value={`$${formatFtsoPrice(market.referenceValue, priceDecimals)}`} mono />
                )}
              </>
            ) : (
              <>
                <Row label="Coordinates" value={`${formatCoordinate(market.latitude)}, ${formatCoordinate(market.longitude)}`} mono />
                <Row label="Rain threshold" value={`${formatRainMm(market.rainThresholdMmE2)} mm`} mono />
                {market.settled && (
                  <Row label="Measured rainfall" value={`${formatRainMm(market.referenceValue)} mm`} mono />
                )}
              </>
            )}
            <Row
              label="Started"
              value={formatUnixTimestamp(Number(market.startTimestamp))}
              icon={<CalendarBlank size={14} />}
            />
            <Row
              label={status === "open" ? "Closes in" : "Expiration"}
              value={
                status === "open"
                  ? formatCountdown(Number(market.expirationTimestamp), now)
                  : formatUnixTimestamp(Number(market.expirationTimestamp))
              }
              icon={<CalendarBlank size={14} />}
              mono
            />

            {market.settled && (
              <div className="mt-2 rounded-lg border border-border-strong bg-surface-raised p-3">
                <Badge variant={market.outcome ? "accent" : "destructive"}>
                  {market.outcome ? <TrendUp size={12} weight="bold" /> : <TrendDown size={12} weight="bold" />}
                  Outcome: {market.outcome ? "Yes / Up" : "No / Down"}
                </Badge>
                <p className="mt-2 text-xs text-muted-foreground">
                  Payouts were computed privately by the TEE against the encrypted bet ledger.
                  Withdraw your balance from the Vault page.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{status === "open" ? "Place a Bet" : "Settlement"}</CardTitle>
          </CardHeader>
          <CardContent>
            {status === "open" && <PlaceBetDialog marketId={marketId} market={market} />}

            {status === "awaiting_settlement" &&
              (isPrice ? (
                <FinalizeSettlementPanel marketId={marketId} />
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-start gap-2 rounded-lg border border-border-strong bg-surface-raised p-3 text-xs text-muted-foreground">
                      <Info size={16} className="mt-0.5 shrink-0" />
                      WEATHER settlement requires an FDC Web2Json proof obtained off-chain
                      (prepare → submit → retrieve from the DA Layer). Not yet wired up in this
                      UI — use the contracts/ Foundry scripts.
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>See flare-foundry-starter&apos;s WeatherId.s.sol flow</TooltipContent>
                </Tooltip>
              ))}

            {status === "settled" && (
              <p className="text-sm text-muted-foreground">This market is settled. No further action here.</p>
            )}

            <YourPosition marketId={marketId} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  accent,
  icon,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: boolean;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border py-1.5 last:border-0">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className={`tabular-nums ${mono ? "font-mono" : ""} ${accent ? "text-accent" : "text-foreground"}`}>
        {value}
      </span>
    </div>
  );
}
