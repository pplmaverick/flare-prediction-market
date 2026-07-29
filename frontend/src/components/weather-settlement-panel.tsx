"use client";

import * as React from "react";
import { decodeEventLog, type Hex } from "viem";
import { useConfig, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { readContract, waitForTransactionReceipt, writeContract as writeContractAction } from "wagmi/actions";
import { ArrowClockwise, Gavel, HourglassMedium } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  predictionMarketContract,
  FLARE_CONTRACT_REGISTRY_ADDRESS,
  flareContractRegistryAbi,
  fdcHubAbi,
  fdcRequestFeeConfigurationsAbi,
} from "@/lib/contract";
import { prepareWeatherAttestationRequest, waitForWeatherProof, WEATHER_PROOF_MAX_POLL_ATTEMPTS } from "@/lib/fdc";
import { useTeeResultFetch, extractResultFields } from "@/lib/use-tee-result";
import { useToast } from "@/components/use-toast";
import { getFriendlyErrorMessage } from "@/lib/errors";
import { parseTokenAmount } from "@/lib/format";
import type { MarketData } from "@/lib/market";

type Step1Phase = "idle" | "preparing" | "submitting" | "polling" | "finalizing" | "done" | "error";

const STEP1_MESSAGES: Record<Step1Phase, string> = {
  idle: "Request Settlement",
  preparing: "Preparing FDC request...",
  submitting: "Submitting to FdcHub...",
  polling: "Waiting for proof...",
  finalizing: "Submitting settlement...",
  done: "Request Settlement",
  error: "Request Settlement",
};

export function WeatherSettlementPanel({ marketId, market }: { marketId: number; market: MarketData }) {
  const { toast } = useToast();
  const config = useConfig();

  const [fee, setFee] = React.useState("0.05");
  const [step1Phase, setStep1Phase] = React.useState<Step1Phase>("idle");
  const [step1Error, setStep1Error] = React.useState<string | null>(null);
  const [pollAttempt, setPollAttempt] = React.useState(0);

  const [actionId, setActionId] = React.useState("");
  const [submissionTag, setSubmissionTag] = React.useState("threshold");
  const [resultData, setResultData] = React.useState("");
  const [status, setStatus] = React.useState("1");
  const [signature, setSignature] = React.useState("");

  const { fetchResult, isFetching, error: fetchError } = useTeeResultFetch();

  const finalize = useWriteContract();
  const finalizeReceipt = useWaitForTransactionReceipt({ hash: finalize.data });

  React.useEffect(() => {
    if (finalizeReceipt.isSuccess) {
      toast({
        title: "Market settled",
        description: "The TEE-signed payout result was accepted on-chain.",
        variant: "success",
      });
    }
  }, [finalizeReceipt.isSuccess, toast]);

  const busy = step1Phase !== "idle" && step1Phase !== "done" && step1Phase !== "error";

  /** Fully automated FDC flow: prepare (Verifier, via our /api/fdc/prepare proxy) -> submit
   * (FdcHub.requestAttestation) -> poll (DA Layer raw proof endpoint) -> finalize
   * (requestWeatherSettlement). Each phase updates step1Phase so the button label tracks
   * progress; the whole thing is one imperative async sequence (via wagmi/actions rather than
   * the hook+effect pattern used in Step 2) since later phases depend on earlier phases'
   * results — most notably the proof, which only exists once FdcHub's tx is mined. */
  async function handleRequestSettlement() {
    setStep1Error(null);
    setPollAttempt(0);
    try {
      setStep1Phase("preparing");
      const abiEncodedRequest = await prepareWeatherAttestationRequest(market.latitude, market.longitude);

      setStep1Phase("submitting");
      const registryContract = { address: FLARE_CONTRACT_REGISTRY_ADDRESS, abi: flareContractRegistryAbi } as const;
      const fdcHubAddress = await readContract(config, {
        ...registryContract,
        functionName: "getContractAddressByName",
        args: ["FdcHub"],
      });
      const feeConfigAddress = await readContract(config, {
        ...registryContract,
        functionName: "getContractAddressByName",
        args: ["FdcRequestFeeConfigurations"],
      });
      const attestationFee = await readContract(config, {
        address: feeConfigAddress,
        abi: fdcRequestFeeConfigurationsAbi,
        functionName: "getRequestFee",
        args: [abiEncodedRequest],
      });
      const submitHash = await writeContractAction(config, {
        address: fdcHubAddress,
        abi: fdcHubAbi,
        functionName: "requestAttestation",
        args: [abiEncodedRequest],
        value: attestationFee,
      });
      await waitForTransactionReceipt(config, { hash: submitHash });

      setStep1Phase("polling");
      const proof = await waitForWeatherProof(abiEncodedRequest, (attempt) => setPollAttempt(attempt));

      setStep1Phase("finalizing");
      const settleHash = await writeContractAction(config, {
        ...predictionMarketContract,
        functionName: "requestWeatherSettlement",
        args: [BigInt(marketId), proof],
        value: parseTokenAmount(fee || "0", 18),
      });
      const receipt = await waitForTransactionReceipt(config, { hash: settleHash });

      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({ abi: predictionMarketContract.abi, data: log.data, topics: log.topics });
          if (decoded.eventName === "SettlementRequested") {
            const args = decoded.args as { instructionId: Hex };
            setActionId(args.instructionId);
            toast({ title: "Settlement requested", description: `Instruction ID: ${args.instructionId}` });
          }
        } catch {
          // not the event we're looking for
        }
      }

      setStep1Phase("done");
    } catch (error) {
      setStep1Phase("error");
      const message = getFriendlyErrorMessage(error);
      setStep1Error(message);
      toast({ title: "Settlement request failed", description: message, variant: "destructive" });
    }
  }

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
        functionName: "settleWeatherMarket",
        args: [resultData as Hex, actionId as Hex, submissionTag, Number(status), signature as Hex],
      },
      {
        onError: (error) =>
          toast({ title: "Finalize failed", description: getFriendlyErrorMessage(error), variant: "destructive" }),
      }
    );
  }

  const step1ButtonLabel =
    step1Phase === "polling"
      ? `${STEP1_MESSAGES.polling} (${pollAttempt}/${WEATHER_PROOF_MAX_POLL_ATTEMPTS})`
      : STEP1_MESSAGES[step1Phase];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="mb-2 text-sm font-medium text-foreground">1. Request Weather Settlement</p>
        <p className="mb-3 text-xs text-muted-foreground">
          Obtains an FDC Web2Json proof of the OpenWeatherMap reading (Verifier → FdcHub → DA
          Layer), verifies it on-chain, then asks a TEE machine to compute payouts.
        </p>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label htmlFor="settle-fee">Network fee (C2FLR)</Label>
            <Input
              id="settle-fee"
              type="number"
              min="0"
              step="any"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              className="mt-2"
            />
          </div>
          <Button variant="outline" onClick={handleRequestSettlement} disabled={busy}>
            <HourglassMedium size={16} weight="bold" />
            {step1ButtonLabel}
          </Button>
        </div>
        {step1Phase === "error" && step1Error && <p className="mt-2 text-xs text-destructive">{step1Error}</p>}
        {step1Phase === "done" && (
          <p className="mt-2 text-xs text-accent">Settlement requested — instruction ID pre-filled below.</p>
        )}
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
            <Input
              id="action-id"
              value={actionId}
              onChange={(e) => setActionId(e.target.value)}
              className="mt-2 font-mono text-xs"
              placeholder="0x..."
            />
          </div>
          <div>
            <Label htmlFor="submission-tag">Submission tag</Label>
            <Input
              id="submission-tag"
              value={submissionTag}
              onChange={(e) => setSubmissionTag(e.target.value)}
              className="mt-2"
            />
          </div>
          <div>
            <Label htmlFor="status">Status</Label>
            <Input id="status" value={status} onChange={(e) => setStatus(e.target.value)} className="mt-2" />
          </div>
          <div className="col-span-2">
            <Label htmlFor="result-data">Result data (hex)</Label>
            <Input
              id="result-data"
              value={resultData}
              onChange={(e) => setResultData(e.target.value)}
              className="mt-2 font-mono text-xs"
              placeholder="0x..."
            />
          </div>
          <div className="col-span-2">
            <Label htmlFor="signature">TEE signature (hex)</Label>
            <Input
              id="signature"
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              className="mt-2 font-mono text-xs"
              placeholder="0x..."
            />
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
