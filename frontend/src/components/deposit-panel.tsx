"use client";

import * as React from "react";
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { ArrowDown, CheckCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { predictionMarketContract, erc20Abi } from "@/lib/contract";
import { usePayTokenAddress, useErc20Meta, useErc20Balance, useErc20Allowance } from "@/lib/hooks";
import { formatTokenAmount, parseTokenAmount } from "@/lib/format";
import { useToast } from "@/components/use-toast";
import { getFriendlyErrorMessage } from "@/lib/errors";

export function DepositPanel() {
  const { toast } = useToast();
  const { address } = useAccount();
  const { data: payToken } = usePayTokenAddress();
  const { decimals, symbol } = useErc20Meta(payToken);
  const { data: balance, refetch: refetchBalance } = useErc20Balance(payToken, address);
  const { data: allowance, refetch: refetchAllowance } = useErc20Allowance(
    payToken,
    address,
    predictionMarketContract.address
  );

  const [amount, setAmount] = React.useState("");
  const [fee, setFee] = React.useState("0.05");

  const approve = useWriteContract();
  const approveReceipt = useWaitForTransactionReceipt({ hash: approve.data });
  const deposit = useWriteContract();
  const depositReceipt = useWaitForTransactionReceipt({ hash: deposit.data });

  React.useEffect(() => {
    if (approveReceipt.isSuccess) {
      refetchAllowance();
      toast({ title: "Approved", description: "You can now deposit.", variant: "success" });
    }
  }, [approveReceipt.isSuccess, refetchAllowance, toast]);

  React.useEffect(() => {
    if (depositReceipt.isSuccess) {
      refetchBalance();
      refetchAllowance();
      // Reacting to a mined tx receipt (an external system), not deriving
      // state from props/state — the recommended fix would need a ref to
      // dedupe re-fires, which isn't worth it for a one-shot form reset.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAmount("");
      toast({ title: "Deposit submitted", description: "Routed to the TEE vault.", variant: "success" });
    }
  }, [depositReceipt.isSuccess, refetchBalance, refetchAllowance, toast]);

  if (!payToken || payToken === "0x0000000000000000000000000000000000000000") {
    return (
      <p className="rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
        Vault is not configured yet — the contract owner hasn&apos;t called{" "}
        <code className="font-mono">setPayToken()</code>.
      </p>
    );
  }
  if (decimals === undefined) {
    return <p className="text-sm text-muted-foreground">Loading token info...</p>;
  }

  const amountWei = amount ? parseTokenAmount(amount, decimals) : 0n;
  const needsApproval = (allowance ?? 0n) < amountWei;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between rounded-lg border border-border-strong bg-surface-raised p-3 text-sm">
        <span className="text-muted-foreground">Wallet balance</span>
        <span className="font-mono tabular-nums text-foreground">
          {balance !== undefined ? formatTokenAmount(balance, decimals) : "—"} {symbol}
        </span>
      </div>

      <div>
        <Label htmlFor="deposit-amount">Amount ({symbol})</Label>
        <Input
          id="deposit-amount"
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
        <Label htmlFor="deposit-fee">Network fee (TEE registry, C2FLR)</Label>
        <Input
          id="deposit-fee"
          type="number"
          min="0"
          step="any"
          value={fee}
          onChange={(e) => setFee(e.target.value)}
          className="mt-2"
        />
      </div>

      {needsApproval ? (
        <Button
          size="lg"
          disabled={!amount || amountWei === 0n || approve.isPending || approveReceipt.isLoading}
          onClick={() =>
            approve.writeContract(
              {
                address: payToken,
                abi: erc20Abi,
                functionName: "approve",
                args: [predictionMarketContract.address, amountWei],
              },
              {
                onError: (error) =>
                  toast({ title: "Approval failed", description: getFriendlyErrorMessage(error), variant: "destructive" }),
              }
            )
          }
        >
          <CheckCircle size={16} weight="bold" />
          {approve.isPending || approveReceipt.isLoading ? "Approving..." : `Approve ${symbol}`}
        </Button>
      ) : (
        <Button
          size="lg"
          disabled={!amount || amountWei === 0n || deposit.isPending || depositReceipt.isLoading}
          onClick={() =>
            deposit.writeContract(
              {
                ...predictionMarketContract,
                functionName: "deposit",
                args: [amountWei],
                value: parseTokenAmount(fee || "0", 18),
              },
              {
                onError: (error) =>
                  toast({ title: "Deposit failed", description: getFriendlyErrorMessage(error), variant: "destructive" }),
              }
            )
          }
        >
          <ArrowDown size={16} weight="bold" />
          {deposit.isPending || depositReceipt.isLoading ? "Depositing..." : "Deposit"}
        </Button>
      )}

      <p className="text-xs text-muted-foreground">
        Deposits are pooled on-chain; your available/locked balance is tracked privately inside
        the TEE, not on-chain.
      </p>
    </div>
  );
}
