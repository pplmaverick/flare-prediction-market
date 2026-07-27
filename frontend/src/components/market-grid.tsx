"use client";

import Link from "next/link";
import { PlusCircle } from "@phosphor-icons/react";
import { MarketCard } from "@/components/market-card";
import { Button } from "@/components/ui/button";
import { useMarketCount } from "@/lib/hooks";

export function MarketGrid() {
  const { data: count, isLoading, isError } = useMarketCount();
  const n = count ? Number(count) : 0;

  if (isError) {
    return (
      <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        Could not reach the contract on Coston2. Check your network connection or RPC status.
      </p>
    );
  }

  if (!isLoading && n === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border-strong py-16 text-center">
        <p className="text-sm text-muted-foreground">No markets yet.</p>
        <Button asChild>
          <Link href="/create">
            <PlusCircle size={16} weight="bold" />
            Create the first market
          </Link>
        </Button>
      </div>
    );
  }

  const ids = isLoading ? Array.from({ length: 3 }, (_, i) => i) : Array.from({ length: n }, (_, i) => n - 1 - i);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {ids.map((id) => (
        <MarketCard key={id} marketId={id} />
      ))}
    </div>
  );
}
