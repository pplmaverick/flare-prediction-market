"use client";

import { useCallback, useState } from "react";

export function useTeeResultFetch() {
  const [isFetching, setIsFetching] = useState(false);
  const [raw, setRaw] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchResult = useCallback(async (actionId: string, submissionTag: string) => {
    setIsFetching(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/tee/result?actionId=${encodeURIComponent(actionId)}&submissionTag=${encodeURIComponent(submissionTag)}`
      );
      const json = await res.json();
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "Failed to fetch result");
        setRaw(json.body ?? json);
        return null;
      }
      setRaw(json.body);
      return json.body as unknown;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error reaching /api/tee/result");
      return null;
    } finally {
      setIsFetching(false);
    }
  }, []);

  return { fetchResult, isFetching, raw, error };
}

// The exact response shape of the TEE proxy's `GET /action/result/{id}` isn't
// documented in this repo beyond the endpoint path (see root README's
// Implementation Notes). The `data` field is a hex string ("0x...") encoding
// UTF-8 JSON, which itself contains a `signature` field that's base64 (not
// hex) — best-effort extraction across the plausible envelope shapes so the
// UI can pre-fill a manual-entry form the user can still correct by hand.
function pick(obj: unknown, keys: string[]): string {
  if (!obj || typeof obj !== "object") return "";
  const record = obj as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null) return String(value);
  }
  return "";
}

function getEncodedData(root: Record<string, unknown> | null): string {
  if (!root) return "";
  if (typeof root.data === "string") return root.data;
  const result = root.result;
  if (result && typeof result === "object" && typeof (result as Record<string, unknown>).data === "string") {
    return (result as Record<string, unknown>).data as string;
  }
  if (typeof root.Data === "string") return root.Data;
  return "";
}

function hexToUtf8(hex: string): string {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return new TextDecoder().decode(bytes);
}

function base64ToHex(base64: string): string {
  const binary = atob(base64);
  let hex = "0x";
  for (let i = 0; i < binary.length; i++) {
    hex += binary.charCodeAt(i).toString(16).padStart(2, "0");
  }
  return hex;
}

function decodeSignatureFromData(encodedData: string): string {
  if (!encodedData) return "";
  try {
    const decoded = hexToUtf8(encodedData);
    const parsed = JSON.parse(decoded) as Record<string, unknown>;
    const innerSignature = pick(parsed, ["signature", "Signature"]);
    return innerSignature ? base64ToHex(innerSignature) : "";
  } catch {
    return "";
  }
}

export interface ExtractedResultFields {
  resultData: string;
  actionId: string;
  submissionTag: string;
  status: string;
  signature: string;
}

export function extractResultFields(
  raw: unknown,
  mode: "settle" | "withdraw" = "settle"
): ExtractedResultFields {
  const root = raw as Record<string, unknown> | null;
  const inner = (root && typeof root === "object" && "result" in root ? root.result : root) as unknown;
  const encodedData = getEncodedData(root);

  return {
    resultData: encodedData,
    actionId: pick(inner, ["id", "actionId", "ID"]),
    submissionTag: pick(inner, ["submissionTag", "SubmissionTag"]),
    status: pick(inner, ["status", "Status"]) || "1",
    // settle (settlePriceMarket/settleWeatherMarket): signature sits at the top level, next to
    // `result`. withdraw (executeWithdrawal): signature is base64, nested inside `data`'s
    // hex-encoded JSON — see decodeSignatureFromData.
    signature: mode === "withdraw" ? decodeSignatureFromData(encodedData) : pick(root, ["signature", "Signature"]),
  };
}
