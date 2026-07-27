"use client";

import * as React from "react";
import { CheckCircle, ArrowSquareOut } from "@phosphor-icons/react";
import { useAccount } from "wagmi";
import { coston2 } from "@/lib/chain";
import { getBetRecord, onBetRecorded, type BetRecord } from "@/lib/bet-history";

export function YourPosition({ marketId }: { marketId: number }) {
  const { address } = useAccount();
  const [record, setRecord] = React.useState<BetRecord | null>(null);

  React.useEffect(() => {
    // Syncing from an external system (localStorage + a custom DOM event),
    // not deriving state from props/state.
    if (!address) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRecord(null);
      return;
    }
    setRecord(getBetRecord(marketId, address));
    return onBetRecorded(() => setRecord(getBetRecord(marketId, address)));
  }, [marketId, address]);

  if (!address || !record) return null;

  return (
    <div className="mt-4 border-t border-border pt-4">
      <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Your position</p>
      <a
        href={`${coston2.blockExplorers.default.url}/tx/${record.txHash}`}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1.5 text-sm text-accent transition-colors hover:text-accent/80"
      >
        <CheckCircle size={16} weight="fill" />
        Bet placed (encrypted) — View on Blockscout
        <ArrowSquareOut size={13} />
      </a>
      <p className="mt-1 text-xs text-muted-foreground">
        Side and amount stay private in the TEE. Remembered on this device only.
      </p>
    </div>
  );
}
