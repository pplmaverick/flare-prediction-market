"use client";

import * as React from "react";
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { CloudRain, LockKey, TrendDown, TrendUp, Warning } from "@phosphor-icons/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { predictionMarketContract } from "@/lib/contract";
import { usePayTokenAddress, useErc20Meta } from "@/lib/hooks";
import { encryptBet } from "@/lib/ecies";
import { getTeePublicKey } from "@/lib/tee-config";
import { parseTokenAmount } from "@/lib/format";
import { isPriceMarket, type MarketData } from "@/lib/market";
import { useToast } from "@/components/use-toast";
import { getFriendlyErrorMessage } from "@/lib/errors";

const DEFAULT_FEE = "0.05";

export function PlaceBetDialog({ marketId, market }: { marketId: number; market: MarketData }) {
  const { isConnected } = useAccount();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [isUp, setIsUp] = React.useState(true);
  const [amount, setAmount] = React.useState("");
  const [fee, setFee] = React.useState(DEFAULT_FEE);
  const [isEncrypting, setIsEncrypting] = React.useState(false);

  const { data: payToken } = usePayTokenAddress();
  const { decimals, symbol } = useErc20Meta(payToken);

  const { writeContract, data: hash, isPending, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const teePublicKey = getTeePublicKey();
  const isPrice = isPriceMarket(market);

  React.useEffect(() => {
    if (isSuccess) {
      toast({
        title: "Bet placed",
        description: "Your encrypted bet was submitted. Its side and amount stay private until settlement.",
        variant: "success",
      });
      // Reacting to a mined tx receipt (an external system), not deriving
      // state from props/state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(false);
      setAmount("");
      reset();
    }
  }, [isSuccess, toast, reset]);

  async function handleSubmit() {
    if (!teePublicKey) {
      toast({
        title: "TEE not configured",
        description: "Set NEXT_PUBLIC_TEE_PUBKEY_X / _Y before betting can be enabled.",
        variant: "destructive",
      });
      return;
    }
    if (!amount || Number(amount) <= 0 || decimals === undefined) return;

    try {
      setIsEncrypting(true);
      const amountWei = parseTokenAmount(amount, decimals);
      const ciphertext = await encryptBet(teePublicKey, isUp, amountWei);
      setIsEncrypting(false);

      writeContract(
        {
          ...predictionMarketContract,
          functionName: "placeBet",
          args: [BigInt(marketId), ciphertext],
          value: parseTokenAmount(fee || "0", 18),
        },
        {
          onError: (error) => {
            toast({ title: "Bet failed", description: getFriendlyErrorMessage(error), variant: "destructive" });
          },
        }
      );
    } catch (error) {
      setIsEncrypting(false);
      toast({
        title: "Could not encrypt bet",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  }

  const busy = isEncrypting || isPending || isConfirming;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" disabled={!isConnected}>
          <LockKey size={16} weight="bold" />
          Place Encrypted Bet
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Place a bet — Market #{marketId}</DialogTitle>
          <DialogDescription>
            Your side and amount are ECIES-encrypted in your browser before this transaction is
            signed. Only the TEE can ever decrypt them.
          </DialogDescription>
        </DialogHeader>

        {!teePublicKey && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
            <Warning size={16} weight="bold" className="mt-0.5 shrink-0" />
            TEE public key not configured (NEXT_PUBLIC_TEE_PUBKEY_X/Y). Betting is disabled until
            it is set.
          </div>
        )}

        <div className="flex flex-col gap-4">
          <div>
            <Label>Side</Label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIsUp(true)}
                className={cn(
                  "flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-colors",
                  isUp
                    ? "border-accent/40 bg-accent/10 text-accent"
                    : "border-border-strong bg-surface-raised text-muted-foreground hover:text-foreground"
                )}
              >
                {isPrice ? <TrendUp size={16} weight="bold" /> : <CloudRain size={16} weight="bold" />}
                {isPrice ? "Up" : "Rain ≥ threshold"}
              </button>
              <button
                type="button"
                onClick={() => setIsUp(false)}
                className={cn(
                  "flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-colors",
                  !isUp
                    ? "border-destructive/40 bg-destructive/10 text-destructive"
                    : "border-border-strong bg-surface-raised text-muted-foreground hover:text-foreground"
                )}
              >
                <TrendDown size={16} weight="bold" />
                {isPrice ? "Down" : "No trigger"}
              </button>
            </div>
          </div>

          <div>
            <Label htmlFor="bet-amount">Amount {symbol ? `(${symbol})` : ""}</Label>
            <Input
              id="bet-amount"
              type="number"
              min="0"
              step="any"
              placeholder="0.0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-2"
            />
          </div>

          <div>
            <Label htmlFor="bet-fee">Network fee (TEE registry, C2FLR)</Label>
            <Input
              id="bet-fee"
              type="number"
              min="0"
              step="any"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              className="mt-2"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Forwarded as msg.value to route your instruction to a TEE machine. Increase this if
              the transaction reverts with &ldquo;fee too low&rdquo;.
            </p>
          </div>

          <Button
            size="lg"
            onClick={handleSubmit}
            disabled={busy || !teePublicKey || !amount || Number(amount) <= 0}
          >
            {isEncrypting
              ? "Encrypting..."
              : isPending
                ? "Confirm in wallet..."
                : isConfirming
                  ? "Submitting..."
                  : "Encrypt & Place Bet"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
