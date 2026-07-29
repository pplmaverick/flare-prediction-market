"use client";

import * as React from "react";
import { decodeEventLog, type Hex } from "viem";
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { ArrowClockwise, ArrowUp, Gavel } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { predictionMarketContract } from "@/lib/contract";
import { usePayTokenAddress, useErc20Meta } from "@/lib/hooks";
import { parseTokenAmount } from "@/lib/format";
import { useTeeResultFetch, extractResultFields } from "@/lib/use-tee-result";
import { useToast } from "@/components/use-toast";
import { getFriendlyErrorMessage } from "@/lib/errors";

export function WithdrawPanel() {
  const { toast } = useToast();
  const { address } = useAccount();
  const { data: payToken } = usePayTokenAddress();
  const { decimals, symbol } = useErc20Meta(payToken);

  const [amount, setAmount] = React.useState("");
  const [to, setTo] = React.useState("");
  const [fee, setFee] = React.useState("0.05");
  const [withdrawalId, setWithdrawalId] = React.useState("");
  const [signature, setSignature] = React.useState("");

  const { fetchResult, isFetching, error: fetchError } = useTeeResultFetch();

  const request = useWriteContract();
  const requestReceipt = useWaitForTransactionReceipt({ hash: request.data });
  const execute = useWriteContract();
  const executeReceipt = useWaitForTransactionReceipt({ hash: execute.data });

  React.useEffect(() => {
    if (!requestReceipt.data) return;
    for (const log of requestReceipt.data.logs) {
      try {
        const decoded = decodeEventLog({ abi: predictionMarketContract.abi, data: log.data, topics: log.topics });
        if (decoded.eventName === "WithdrawRequested") {
          const args = decoded.args as { instructionId: Hex };
          // Reacting to a mined tx receipt (an external system), not
          // deriving state from props/state.
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setWithdrawalId(args.instructionId);
          if (address) {
            localStorage.setItem(`withdrawal-id-${address}`, args.instructionId);
          }
          toast({ title: "Withdrawal requested", description: `Instruction ID: ${args.instructionId}` });
        }
      } catch {
        // not the event we're looking for
      }
    }
  }, [requestReceipt.data, address, toast]);

  // Pre-fills withdrawalId from a prior session's withdraw request for this wallet, so a page
  // reload doesn't lose the instruction ID needed for step 2. Mount-only by design (same pattern
  // as FinalizeSettlementPanel); guarded on address since useAccount() resolves the connected
  // wallet asynchronously and may still be undefined at this component's first render.
  React.useEffect(() => {
    if (!address) return;
    const stored = localStorage.getItem(`withdrawal-id-${address}`);
    if (stored && !withdrawalId) {
      // Reacting to localStorage (an external system) on mount, not deriving state from
      // props/state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWithdrawalId(stored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (executeReceipt.isSuccess) {
      toast({ title: "Withdrawal executed", description: "Funds transferred to the recipient.", variant: "success" });
    }
  }, [executeReceipt.isSuccess, toast]);

  if (!payToken || payToken === "0x0000000000000000000000000000000000000000" || decimals === undefined) {
    return <p className="text-sm text-muted-foreground">Vault not configured or token info loading.</p>;
  }

  const amountWei = amount ? parseTokenAmount(amount, decimals) : 0n;

  async function handleFetchSignature() {
    if (!withdrawalId) return;
    const raw = await fetchResult(withdrawalId, "threshold");
    if (raw) {
      const fields = extractResultFields(raw, "withdraw");
      if (fields.signature) setSignature(fields.signature);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="mb-2 text-sm font-medium text-foreground">1. Request withdrawal</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="withdraw-amount">Amount ({symbol})</Label>
            <Input id="withdraw-amount" type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-2" />
          </div>
          <div>
            <Label htmlFor="withdraw-to">Recipient</Label>
            <Input id="withdraw-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder={address ?? "0x..."} className="mt-2 font-mono text-xs" />
          </div>
          <div className="col-span-2">
            <Label htmlFor="withdraw-fee">Network fee (C2FLR)</Label>
            <Input id="withdraw-fee" type="number" min="0" step="any" value={fee} onChange={(e) => setFee(e.target.value)} className="mt-2" />
          </div>
        </div>
        <Button
          size="lg"
          className="mt-3"
          disabled={!amountWei || request.isPending || requestReceipt.isLoading}
          onClick={() =>
            request.writeContract(
              {
                ...predictionMarketContract,
                functionName: "withdraw",
                args: [amountWei, (to || address || "0x0000000000000000000000000000000000000000") as Hex],
                value: parseTokenAmount(fee || "0", 18),
              },
              {
                onError: (error) =>
                  toast({ title: "Request failed", description: getFriendlyErrorMessage(error), variant: "destructive" }),
              }
            )
          }
        >
          <ArrowUp size={16} weight="bold" />
          {request.isPending || requestReceipt.isLoading ? "Requesting..." : "Request Withdrawal"}
        </Button>
      </div>

      <div className="border-t border-border pt-5">
        <p className="mb-2 text-sm font-medium text-foreground">2. Execute with TEE signature</p>
        <p className="mb-3 text-xs text-muted-foreground">
          <code className="font-mono">withdrawalId</code> defaults to the request&apos;s instruction ID.
          Confirm this matches what the TEE actually signs before relying on it.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label htmlFor="withdrawal-id">Withdrawal ID</Label>
            <Input id="withdrawal-id" value={withdrawalId} onChange={(e) => setWithdrawalId(e.target.value)} className="mt-2 font-mono text-xs" placeholder="0x..." />
          </div>
          <div className="col-span-2">
            <Label htmlFor="withdraw-signature">TEE signature (hex)</Label>
            <Input id="withdraw-signature" value={signature} onChange={(e) => setSignature(e.target.value)} className="mt-2 font-mono text-xs" placeholder="0x..." />
          </div>
        </div>
        {fetchError && <p className="mt-2 text-xs text-destructive">{fetchError}</p>}
        <div className="mt-3 flex gap-2">
          <Button variant="outline" onClick={handleFetchSignature} disabled={!withdrawalId || isFetching}>
            <ArrowClockwise size={16} weight="bold" />
            {isFetching ? "Fetching..." : "Fetch from TEE proxy"}
          </Button>
          <Button
            disabled={!amountWei || !withdrawalId || !signature || execute.isPending || executeReceipt.isLoading}
            onClick={() =>
              execute.writeContract(
                {
                  ...predictionMarketContract,
                  functionName: "executeWithdrawal",
                  args: [amountWei, (to || address || "0x0000000000000000000000000000000000000000") as Hex, withdrawalId as Hex, signature as Hex],
                },
                {
                  onError: (error) =>
                    toast({ title: "Execution failed", description: getFriendlyErrorMessage(error), variant: "destructive" }),
                }
              )
            }
          >
            <Gavel size={16} weight="bold" />
            {execute.isPending || executeReceipt.isLoading ? "Executing..." : "Execute Withdrawal"}
          </Button>
        </div>
      </div>
    </div>
  );
}
