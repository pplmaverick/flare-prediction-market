import Link from "next/link";
import { ChartLineUp as ChartLineUpSsr, LockKey, PlusCircle } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MarketGrid } from "@/components/market-grid";

export default function Home() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <section className="mb-10 flex flex-col gap-6 border-b border-border pb-10 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <Badge variant="confidential" className="mb-4">
            <LockKey size={12} weight="bold" />
            Flare Confidential Compute
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Predict outcomes. Bet privately.
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            PRICE markets settle against live FTSO feeds; WEATHER markets settle against
            FDC-verified rainfall data. Every bet is ECIES-encrypted client-side — its side and
            amount stay confidential inside a TEE until settlement.
          </p>
        </div>
        <div className="flex shrink-0 gap-3">
          <Button variant="outline" asChild>
            <Link href="/vault">Manage Vault</Link>
          </Button>
          <Button asChild>
            <Link href="/create">
              <PlusCircle size={16} weight="bold" />
              Create Market
            </Link>
          </Button>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center gap-2">
          <ChartLineUpSsr size={18} className="text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Markets</h2>
        </div>
        <MarketGrid />
      </section>
    </div>
  );
}
