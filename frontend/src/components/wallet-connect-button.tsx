"use client";

import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { Wallet, ArrowSquareOut, SignOut, Warning } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { coston2 } from "@/lib/chain";
import { truncateAddress } from "@/lib/format";
import { useToast } from "@/components/use-toast";

export function WalletConnectButton() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { toast } = useToast();

  const injected = connectors[0];

  if (!isConnected) {
    return (
      <Button
        size="sm"
        onClick={() => {
          connect(
            { connector: injected },
            {
              onError: (error) => {
                toast({
                  title: "Could not connect wallet",
                  description: error.message.includes("not been authorized")
                    ? "No injected wallet found. Install MetaMask to continue."
                    : error.message,
                  variant: "destructive",
                });
              },
            }
          );
        }}
        disabled={isPending}
      >
        <Wallet size={16} weight="bold" />
        {isPending ? "Connecting..." : "Connect Wallet"}
      </Button>
    );
  }

  if (chainId !== coston2.id) {
    return (
      <Button
        size="sm"
        variant="destructive"
        onClick={() => switchChain({ chainId: coston2.id })}
        disabled={isSwitching}
      >
        <Warning size={16} weight="bold" />
        {isSwitching ? "Switching..." : "Switch to Coston2"}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <a
        href={`${coston2.blockExplorers.default.url}/address/${address}`}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1.5 rounded-lg border border-border-strong bg-surface-raised px-3 py-2 font-mono text-xs text-foreground transition-colors hover:bg-surface"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        {truncateAddress(address ?? "")}
        <ArrowSquareOut size={13} />
      </a>
      <Button variant="ghost" size="icon" onClick={() => disconnect()} aria-label="Disconnect wallet">
        <SignOut size={16} />
      </Button>
    </div>
  );
}
