"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck, ChartLineUp, Vault, PlusCircle, ListChecks } from "@phosphor-icons/react";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Markets", icon: ChartLineUp },
  { href: "/vault", label: "Vault", icon: Vault },
  { href: "/my-bets", label: "My Bets", icon: ListChecks },
  { href: "/create", label: "Create Market", icon: PlusCircle },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-confidential text-primary-foreground">
            <ShieldCheck size={18} weight="fill" />
          </span>
          <span className="hidden text-sm font-semibold tracking-tight sm:inline">
            Flare Prediction Market
          </span>
        </Link>

        <nav className="flex items-center gap-1 rounded-lg border border-border bg-surface/60 p-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <item.icon size={15} weight={active ? "fill" : "regular"} />
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <WalletConnectButton />
        </div>
      </div>
    </header>
  );
}
