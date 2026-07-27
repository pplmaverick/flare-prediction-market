"use client";

import { CheckCircle, ArrowSquareOut, HourglassMedium } from "@phosphor-icons/react";
import { useAccount } from "wagmi";
import { coston2 } from "@/lib/chain";
import { useUserBet } from "@/lib/hooks";

export function YourPosition({ marketId }: { marketId: number }) {
  const { address } = useAccount();
  const { data: bet, isLoading } = useUserBet(marketId, address);

  if (!address) return null;

  return (
    <div className="mt-4 border-t border-border pt-4">
      <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Your position</p>

      {isLoading ? (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <HourglassMedium size={14} className="animate-pulse-slow" />
          Checking on-chain...
        </p>
      ) : bet ? (
        <>
          <a
            href={`${coston2.blockExplorers.default.url}/tx/${bet.txHash}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-sm text-accent transition-colors hover:text-accent/80"
          >
            <CheckCircle size={16} weight="fill" />
            Bet placed (encrypted) — View on Blockscout
            <ArrowSquareOut size={13} />
          </a>
          <p className="mt-1 text-xs text-muted-foreground">
            Which side you bet stays private in the TEE — the bet&apos;s existence and amount are
            public on-chain.
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">No bet placed yet on this market.</p>
      )}
    </div>
  );
}
