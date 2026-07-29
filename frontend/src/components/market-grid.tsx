"use client";

import * as React from "react";
import Link from "next/link";
import { ChartLineUp, PlusCircle } from "@phosphor-icons/react";
import { MarketCard } from "@/components/market-card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMarketCount } from "@/lib/hooks";
import type { MarketTypeFilter } from "@/lib/market";

export function MarketGrid() {
  const { data: count, isLoading, isError } = useMarketCount();
  const [typeFilter, setTypeFilter] = React.useState<MarketTypeFilter>("all");
  const n = count ? Number(count) : 0;

  const header = (
    <div className="mb-4">
      <div className="flex items-center gap-2">
        <ChartLineUp size={18} className="text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Markets</h2>
      </div>
      <div className="mt-4 flex justify-center">
        <Tabs value={typeFilter} onValueChange={(value) => setTypeFilter(value as MarketTypeFilter)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="price">Price</TabsTrigger>
            <TabsTrigger value="weather">Weather</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
    </div>
  );

  if (isError) {
    return (
      <>
        {header}
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Could not reach the contract on Coston2. Check your network connection or RPC status.
        </p>
      </>
    );
  }

  if (!isLoading && n === 0) {
    return (
      <>
        {header}
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border-strong py-16 text-center">
          <p className="text-sm text-muted-foreground">No markets yet.</p>
          <Button asChild>
            <Link href="/create">
              <PlusCircle size={16} weight="bold" />
              Create the first market
            </Link>
          </Button>
        </div>
      </>
    );
  }

  const ids = isLoading ? Array.from({ length: 3 }, (_, i) => i) : Array.from({ length: n }, (_, i) => n - 1 - i);

  return (
    <>
      {header}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ids.map((id) => (
          <MarketCard key={id} marketId={id} typeFilter={typeFilter} />
        ))}
      </div>
    </>
  );
}
