"use client";

import * as React from "react";
import { decodeEventLog, type Hex } from "viem";
import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { ArrowClockwise, Gavel, HourglassMedium } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { predictionMarketContract } from "@/lib/contract";
import { useTeeResultFetch, extractResultFields } from "@/lib/use-tee-result";
import { useToast } from "@/components/use-toast";
import { getFriendlyErrorMessage } from "@/lib/errors";
import { parseTokenAmount } from "@/lib/format";

export function FinalizeSettlementPanel({
  marketId,
  onSettled,
}: {
  marketId: number;
  onSettled?: () => void;
}) {
  const { toast } = useToast();
  const [fee, setFee] = React.useState("0.05");
  const [actionId, setActionId] = React.useState("");
  const [submissionTag, setSubmissionTag] = React.useState("threshold");
  const [resultData, setResultData] = React.useState("");
  const [status, setStatus] = React.useState("1");
  const [signature, setSignature] = React.useState("");

  const { fetchResult, isFetching, error: fetchError } = useTeeResultFetch();

  const request = useWriteContract();
  const requestReceipt = useWaitForTransactionReceipt({ hash: request.data });

  const finalize = useWriteContract();
  const finalizeReceipt = useWaitForTransactionReceipt({ hash: finalize.data });

  React.useEffect(() => {
    if (!requestReceipt.data) return;
    for (const log of requestReceipt.data.logs) {
      try {
        const decoded = decodeEventLog({
          abi: predictionMarketContract.abi,
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName === "SettlementRequested") {
          const args = decoded.args as { instructionId: Hex };
          // Reacting to a mined tx receipt (an external system), not
          // deriving state from props/state.
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setActionId(args.instructionId);
          localStorage.setItem(`settlement-action-id-${marketId}`, args.instructionId);
          toast({ title: "Settlement requested", description: `Instruction ID: ${args.instructionId}` });
        }
      } catch {
        // not the event we're looking for
      }
    }
  }, [requestReceipt.data, marketId, toast]);

  // Pre-fills actionId from a prior session's requestPriceSettlement call for this market, so a
  // page reload (or revisiting later once the TEE has finished processing) doesn't lose the
  // instruction ID needed for step 2. Mount-only by design — marketId doesn't change without a
  // remount in how this component is used (see market/[id]/page.tsx).
  React.useEffect(() => {
    const stored = localStorage.getItem(`settlement-action-id-${marketId}`);
    if (stored && !actionId) {
      // Reacting to localStorage (an external system) on mount, not deriving state from
      // props/state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActionId(stored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (finalizeReceipt.isSuccess) {
      toast({ title: "Market settled", description: "The TEE-signed payout result was accepted on-chain.", variant: "success" });
      onSettled?.();
    }
  }, [finalizeReceipt.isSuccess, toast, onSettled]);

  async function handleFetch() {
    if (!actionId) return;
    const raw = await fetchResult(actionId, submissionTag);
    if (raw) {
      const fields = extractResultFields(raw);
      if (fields.resultData) setResultData(fields.resultData);
      if (fields.submissionTag) setSubmissionTag(fields.submissionTag);
      if (fields.status) setStatus(fields.status);
      if (fields.signature) setSignature(fields.signature);
    }
  }

  function handleFinalize() {
    finalize.writeContract(
      {
        ...predictionMarketContract,
        functionName: "settlePriceMarket",
        args: [resultData as Hex, actionId as Hex, submissionTag, Number(status), signature as Hex],
      },
      {
        onError: (error) =>
          toast({ title: "Finalize failed", description: getFriendlyErrorMessage(error), variant: "destructive" }),
      }
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="mb-2 text-sm font-medium text-foreground">1. Request settlement</p>
        <p className="mb-3 text-xs text-muted-foreground">
          Reads the FTSO end price on-chain and asks a TEE machine to compute payouts.
        </p>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label htmlFor="settle-fee">Network fee (C2FLR)</Label>
            <Input id="settle-fee" type="number" min="0" step="any" value={fee} onChange={(e) => setFee(e.target.value)} className="mt-2" />
          </div>
          <Button
            variant="outline"
            onClick={() =>
              request.writeContract(
                {
                  ...predictionMarketContract,
                  functionName: "requestPriceSettlement",
                  args: [BigInt(marketId)],
                  value: parseTokenAmount(fee || "0", 18),
                },
                {
                  onError: (error) =>
                    toast({ title: "Request failed", description: getFriendlyErrorMessage(error), variant: "destructive" }),
                }
              )
            }
            disabled={request.isPending || requestReceipt.isLoading || !!requestReceipt.data}
          >
            <HourglassMedium size={16} weight="bold" />
            {request.isPending || requestReceipt.isLoading ? "Requesting..." : "Request Settlement"}
          </Button>
        </div>
      </div>

      <div className="border-t border-border pt-5">
        <p className="mb-2 text-sm font-medium text-foreground">2. Fetch TEE result &amp; finalize</p>
        <p className="mb-3 text-xs text-muted-foreground">
          Requires the TEE proxy to be reachable at <code className="font-mono">TEE_PROXY_URL</code>. If
          auto-fetch fails, paste the signed result fields manually.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label htmlFor="action-id">Action / Instruction ID</Label>
            <Input id="action-id" value={actionId} onChange={(e) => setActionId(e.target.value)} className="mt-2 font-mono text-xs" placeholder="0x..." />
          </div>
          <div>
            <Label htmlFor="submission-tag">Submission tag</Label>
            <Input id="submission-tag" value={submissionTag} onChange={(e) => setSubmissionTag(e.target.value)} className="mt-2" />
          </div>
          <div>
            <Label htmlFor="status">Status</Label>
            <Input id="status" value={status} onChange={(e) => setStatus(e.target.value)} className="mt-2" />
          </div>
          <div className="col-span-2">
            <Label htmlFor="result-data">Result data (hex)</Label>
            <Input id="result-data" value={resultData} onChange={(e) => setResultData(e.target.value)} className="mt-2 font-mono text-xs" placeholder="0x..." />
          </div>
          <div className="col-span-2">
            <Label htmlFor="signature">TEE signature (hex)</Label>
            <Input id="signature" value={signature} onChange={(e) => setSignature(e.target.value)} className="mt-2 font-mono text-xs" placeholder="0x..." />
          </div>
        </div>

        {fetchError && <p className="mt-2 text-xs text-destructive">{fetchError}</p>}

        <div className="mt-4 flex gap-2">
          <Button variant="outline" onClick={handleFetch} disabled={!actionId || isFetching}>
            <ArrowClockwise size={16} weight="bold" />
            {isFetching ? "Fetching..." : "Fetch from TEE proxy"}
          </Button>
          <Button
            onClick={handleFinalize}
            disabled={!resultData || !actionId || !signature || finalize.isPending || finalizeReceipt.isLoading}
          >
            <Gavel size={16} weight="bold" />
            {finalize.isPending || finalizeReceipt.isLoading ? "Finalizing..." : "Submit & Finalize"}
          </Button>
        </div>
      </div>
    </div>
  );
}
