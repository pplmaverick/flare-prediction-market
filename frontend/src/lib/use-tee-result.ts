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
// Implementation Notes) — best-effort field extraction across the plausible
// shapes (flat ActionResult, or {result, signature} wrapper) so the UI can
// pre-fill a manual-entry form the user can still correct by hand.
function pick(obj: unknown, keys: string[]): string {
  if (!obj || typeof obj !== "object") return "";
  const record = obj as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null) return String(value);
  }
  return "";
}

export interface ExtractedResultFields {
  resultData: string;
  actionId: string;
  submissionTag: string;
  status: string;
  signature: string;
}

export function extractResultFields(raw: unknown): ExtractedResultFields {
  const root = raw as Record<string, unknown> | null;
  const inner = (root && typeof root === "object" && "result" in root ? root.result : root) as unknown;

  return {
    resultData: pick(inner, ["data", "resultData", "Data"]),
    actionId: pick(inner, ["id", "actionId", "ID"]),
    submissionTag: pick(inner, ["submissionTag", "SubmissionTag"]),
    status: pick(inner, ["status", "Status"]) || "1",
    signature: pick(root, ["signature", "Signature"]) || pick(inner, ["signature", "Signature"]),
  };
}
