"use client";

import * as React from "react";
import Link from "next/link";
import type { Address, Hex } from "viem";
import { useAccount } from "wagmi";
import {
  ArrowSquareOut,
  CheckCircle,
  HourglassMedium,
  ListChecks,
  Warning,
  XCircle,
} from "@phosphor-icons/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { readBetHistory, type BetHistoryEntry } from "@/lib/bet-history";
import { useErc20Meta, useMarket, useNow, usePayTokenAddress, useVerifyBet } from "@/lib/hooks";
import { decodeFeedSymbol, getMarketStatus, isPriceMarket } from "@/lib/market";
import { findCityName, formatTokenAmount } from "@/lib/format";
import { coston2 } from "@/lib/chain";

export default function MyBetsPage() {
  const { address, isConnected } = useAccount();
  const [history, setHistory] = React.useState<BetHistoryEntry[]>([]);
  const { data: payToken } = usePayTokenAddress();
  const { decimals: payDecimals, symbol: paySymbol } = useErc20Meta(payToken);

  React.useEffect(() => {
    // Reacting to localStorage (an external system) on mount/address-change, not deriving
    // state from props/state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHistory(address ? readBetHistory(address) : []);
  }, [address]);

  const sorted = React.useMemo(() => [...history].sort((a, b) => b.timestamp - a.timestamp), [history]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-raised text-primary">
          <ListChecks size={22} weight="bold" />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-foreground">My Bets</h1>
          <p className="text-sm text-muted-foreground">Bets you&apos;ve placed from this browser</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bet History</CardTitle>
          <CardDescription>
            Recorded locally in this browser&apos;s storage when you place a bet — clearing site
            data or betting from another device won&apos;t show up here. Each entry is checked
            against Blockscout to confirm the bet actually exists on-chain.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!isConnected ? (
            <p className="text-sm text-muted-foreground">Connect your wallet to see your bet history.</p>
          ) : sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bets recorded on this browser yet.</p>
          ) : (
            <>
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
                <Warning size={16} weight="bold" className="mt-0.5 shrink-0" />
                Your direction (side/bucket) below is stored in plaintext in this browser&apos;s
                localStorage for your own convenience — it is never sent anywhere, but on-chain it
                stays ECIES-encrypted until settlement, only decryptable by the TEE.
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">Market</th>
                      <th className="py-2 pr-4 font-medium">Type</th>
                      <th className="py-2 pr-4 font-medium">Direction</th>
                      <th className="py-2 pr-4 font-medium">Amount</th>
                      <th className="py-2 pr-4 font-medium">Status</th>
                      <th className="py-2 pr-4 font-medium">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((entry, i) => (
                      <BetHistoryRow
                        key={`${entry.marketId}-${entry.txHash}-${i}`}
                        entry={entry}
                        address={address as Address}
                        payDecimals={payDecimals}
                        paySymbol={paySymbol}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BetHistoryRow({
  entry,
  address,
  payDecimals,
  paySymbol,
}: {
  entry: BetHistoryEntry;
  address: Address;
  payDecimals: number | undefined;
  paySymbol: string | undefined;
}) {
  const marketId = Number(entry.marketId);
  const now = useNow(5000);
  const { data: market, isLoading: marketLoading } = useMarket(marketId);
  const { data: verified, isLoading: verifyLoading } = useVerifyBet(marketId, address, entry.txHash as Hex);

  const isPrice = market ? isPriceMarket(market) : entry.marketType === "PRICE";
  const marketLabel = market
    ? isPrice
      ? decodeFeedSymbol(market.feedId)
      : (findCityName(market.latitude, market.longitude) ?? "Weather Market")
    : undefined;

  const status = market ? getMarketStatus(market, now) : undefined;
  const result: "won" | "lost" | "pending" =
    market?.settled ? (entry.bucketIndex === market.winningBucket ? "won" : "lost") : "pending";

  const amountLabel =
    payDecimals !== undefined
      ? `${formatTokenAmount(BigInt(entry.amount), payDecimals)}${paySymbol ? ` ${paySymbol}` : ""}`
      : "—";

  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-2.5 pr-4">
        <div className="flex items-center gap-1.5">
          <Link href={`/market/${marketId}`} className="font-mono text-foreground transition-colors hover:text-primary">
            #{marketId}
            {marketLoading ? "" : marketLabel ? ` ${marketLabel}` : ""}
          </Link>
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={`${coston2.blockExplorers.default.url}/tx/${entry.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
              >
                {verifyLoading ? (
                  <HourglassMedium size={14} className="animate-pulse-slow" />
                ) : verified ? (
                  <CheckCircle size={14} weight="fill" className="text-accent" />
                ) : (
                  <Warning size={14} weight="fill" className="text-warning" />
                )}
              </a>
            </TooltipTrigger>
            <TooltipContent>
              {verifyLoading ? (
                "Checking Blockscout..."
              ) : verified ? (
                <span className="flex items-center gap-1">
                  Confirmed on-chain <ArrowSquareOut size={11} />
                </span>
              ) : (
                "Not found on-chain yet (indexing lag, wrong network, or edited local storage)"
              )}
            </TooltipContent>
          </Tooltip>
        </div>
      </td>
      <td className="py-2.5 pr-4">
        <Badge variant="neutral">{entry.marketType}</Badge>
      </td>
      <td className="py-2.5 pr-4 text-foreground">{entry.direction}</td>
      <td className="py-2.5 pr-4 font-mono tabular-nums text-foreground">{amountLabel}</td>
      <td className="py-2.5 pr-4">
        {status ? <StatusBadge status={status} /> : <span className="text-muted-foreground">—</span>}
      </td>
      <td className="py-2.5 pr-4">
        {result === "pending" ? (
          <Badge variant="neutral">Pending</Badge>
        ) : result === "won" ? (
          <Badge variant="accent">
            <CheckCircle size={12} weight="bold" />
            Won
          </Badge>
        ) : (
          <Badge variant="destructive">
            <XCircle size={12} weight="bold" />
            Lost
          </Badge>
        )}
      </td>
    </tr>
  );
}
