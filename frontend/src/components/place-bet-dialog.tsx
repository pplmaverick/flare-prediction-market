"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import { encryptBucketChoice } from "@/lib/ecies";
import { getTeePublicKey } from "@/lib/tee-config";
import { parseTokenAmount } from "@/lib/format";
import { bucketCount, bucketRangeLabel, isPriceMarket, type MarketData } from "@/lib/market";
import { appendBetHistory, type StoredMarketType } from "@/lib/bet-history";
import { useToast } from "@/components/use-toast";
import { getFriendlyErrorMessage } from "@/lib/errors";

const DEFAULT_FEE = "0.05";

export function PlaceBetDialog({ marketId, market }: { marketId: number; market: MarketData }) {
  const { address, isConnected } = useAccount();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  // PRICE markets use bucket 0 = Down, 1 = Up (see PredictionMarket.sol's PlaceBetMessage).
  const [bucketIndex, setBucketIndex] = React.useState(1);
  const [amount, setAmount] = React.useState("");
  const [fee, setFee] = React.useState(DEFAULT_FEE);
  const [isEncrypting, setIsEncrypting] = React.useState(false);

  const { data: payToken } = usePayTokenAddress();
  const { decimals, symbol } = useErc20Meta(payToken);

  const { writeContract, data: hash, isPending, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const teePublicKey = getTeePublicKey();
  const isPrice = isPriceMarket(market);
  const numBuckets = isPrice ? 2 : bucketCount(market.bucketThresholds);

  // Captured at submit time (not read back out of `bucketIndex`/`amount` state later) so the
  // history entry always reflects exactly what was sent on-chain, even if the user has since
  // touched the form again before the receipt lands.
  const pendingBetRef = React.useRef<{
    marketType: StoredMarketType;
    bucketIndex: number;
    direction: string;
    amountWei: string;
  } | null>(null);

  React.useEffect(() => {
    if (isSuccess && hash && address) {
      const pending = pendingBetRef.current;
      if (pending) {
        appendBetHistory(address, {
          marketId: String(marketId),
          marketType: pending.marketType,
          direction: pending.direction,
          bucketIndex: pending.bucketIndex,
          amount: pending.amountWei,
          timestamp: Date.now(),
          txHash: hash,
        });
        pendingBetRef.current = null;
      }

      toast({
        title: "Bet placed",
        description: "Your encrypted bet was submitted. Its side stays private until settlement.",
        variant: "success",
      });
      // "Your position" reads this from Blockscout, which indexes a mined tx
      // with a short lag — refetch now and once more shortly after to pick
      // it up without requiring a manual page reload.
      const queryKey = ["user-bet", marketId, address];
      queryClient.invalidateQueries({ queryKey });
      const timer = setTimeout(() => queryClient.invalidateQueries({ queryKey }), 3000);
      // Reacting to a mined tx receipt (an external system), not deriving
      // state from props/state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(false);
      setAmount("");
      reset();
      return () => clearTimeout(timer);
    }
  }, [isSuccess, hash, address, marketId, toast, reset, queryClient]);

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
      const ciphertext = await encryptBucketChoice(teePublicKey, bucketIndex);
      setIsEncrypting(false);

      pendingBetRef.current = {
        marketType: isPrice ? "PRICE" : "WEATHER",
        bucketIndex,
        direction: isPrice
          ? bucketIndex === 1
            ? "Up"
            : "Down"
          : bucketRangeLabel(market.bucketThresholds, bucketIndex),
        amountWei: amountWei.toString(),
      };

      writeContract(
        {
          ...predictionMarketContract,
          functionName: "placeBet",
          args: [BigInt(marketId), amountWei, ciphertext],
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
            Your side is ECIES-encrypted in your browser before this transaction is signed — only
            the TEE can ever decrypt it. The amount is public on-chain (it feeds the market&apos;s
            total pool), but which side it&apos;s on stays private until settlement.
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
          <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
            <Warning size={16} weight="bold" className="mt-0.5 shrink-0" />
            Your available balance is tracked privately by the TEE. Ensure you have deposited
            sufficient funds in the Vault before placing a bet.
          </div>

          {isPrice ? (
            <div>
              <Label>Side</Label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setBucketIndex(1)}
                  className={cn(
                    "flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-colors",
                    bucketIndex === 1
                      ? "border-accent/40 bg-accent/10 text-accent"
                      : "border-border-strong bg-surface-raised text-muted-foreground hover:text-foreground"
                  )}
                >
                  <TrendUp size={16} weight="bold" />
                  Up
                </button>
                <button
                  type="button"
                  onClick={() => setBucketIndex(0)}
                  className={cn(
                    "flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-colors",
                    bucketIndex === 0
                      ? "border-destructive/40 bg-destructive/10 text-destructive"
                      : "border-border-strong bg-surface-raised text-muted-foreground hover:text-foreground"
                  )}
                >
                  <TrendDown size={16} weight="bold" />
                  Down
                </button>
              </div>
            </div>
          ) : (
            <div>
              <Label>Temperature bucket</Label>
              <div className="mt-2 flex flex-col gap-2">
                {Array.from({ length: numBuckets }, (_, i) => i).map((i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setBucketIndex(i)}
                    className={cn(
                      "flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors",
                      bucketIndex === i
                        ? "border-accent/40 bg-accent/10 text-accent"
                        : "border-border-strong bg-surface-raised text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <CloudRain size={16} weight="bold" />
                    {bucketRangeLabel(market.bucketThresholds, i)}
                  </button>
                ))}
              </div>
            </div>
          )}

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
