import { decodeAbiParameters, type Hex } from "viem";

/** Requests a Web2Json attestation for a WEATHER market's OpenWeatherMap reading via this app's
 * `/api/fdc/prepare` route (keeps OPEN_WEATHER_API_KEY server-side — the Verifier needs it to
 * live-fetch OpenWeatherMap and compute the request's message integrity code). `latitude`/
 * `longitude` are the market's raw 1e6-scaled on-chain values; the route does the decimal-string
 * conversion. Returns the abiEncodedRequest to submit to FdcHub. */
export async function prepareWeatherAttestationRequest(latitude: bigint, longitude: bigint): Promise<Hex> {
  const res = await fetch("/api/fdc/prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat: latitude.toString(), lon: longitude.toString() }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(typeof json.error === "string" ? json.error : `Prepare request failed (${res.status})`);
  }
  return json.abiEncodedRequest as Hex;
}

/** Mirrors IWeb2Json.Response exactly (flare-periphery's IWeb2Json.sol) — hand-written like this
 * repo's other minimal ABI fragments (contract.ts's erc20Abi/testFtsoV2Abi) rather than pulled
 * out of the full predictionMarketAbi JSON. */
export interface Web2JsonResponse {
  attestationType: Hex;
  sourceId: Hex;
  votingRound: bigint;
  lowestUsedTimestamp: bigint;
  requestBody: {
    url: string;
    httpMethod: string;
    headers: string;
    queryParams: string;
    body: string;
    postProcessJq: string;
    abiSignature: string;
  };
  responseBody: { abiEncodedData: Hex };
}

const WEB2JSON_RESPONSE_ABI_PARAMETER = {
  type: "tuple",
  components: [
    { name: "attestationType", type: "bytes32" },
    { name: "sourceId", type: "bytes32" },
    { name: "votingRound", type: "uint64" },
    { name: "lowestUsedTimestamp", type: "uint64" },
    {
      name: "requestBody",
      type: "tuple",
      components: [
        { name: "url", type: "string" },
        { name: "httpMethod", type: "string" },
        { name: "headers", type: "string" },
        { name: "queryParams", type: "string" },
        { name: "body", type: "string" },
        { name: "postProcessJq", type: "string" },
        { name: "abiSignature", type: "string" },
      ],
    },
    {
      name: "responseBody",
      type: "tuple",
      components: [{ name: "abiEncodedData", type: "bytes" }],
    },
  ],
} as const;

/** Matches PredictionMarket.sol's `requestWeatherSettlement(uint256, IWeb2Json.Proof)` second
 * argument shape exactly. */
export interface WeatherProof {
  merkleProof: Hex[];
  data: Web2JsonResponse;
}

/** Single poll attempt against the DA Layer's `/api/v1/fdc/proof-by-request-round-raw` endpoint,
 * via this app's `/api/fdc/proof` route (schema confirmed against the DA Layer's live OpenAPI
 * spec: `AttestationResultRawV1` — top-level `response_hex` / `attestation_type` / `proof`
 * fields). Proxied server-side rather than called directly — the DA Layer doesn't send CORS
 * headers for browser-origin requests, so a direct fetch fails immediately with a bare "Failed
 * to fetch" (no HTTP status, not retried). Returns null while the round hasn't been indexed yet
 * (mirrors contracts/script/fdc/Base.s.sol's retrieveProof: absent response_hex = not ready).
 * `votingRoundId` is deliberately never sent — Base.s.sol's comment explains why: a request
 * submitted in round N actually lands in round N+1's Merkle tree, so pinning to the
 * submission-time round is unreliable, and omitting it lets the DA Layer return "the latest
 * matching proof" instead. */
export async function pollWeatherProof(abiEncodedRequest: Hex): Promise<WeatherProof | null> {
  const res = await fetch("/api/fdc/proof", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestBytes: abiEncodedRequest }),
  });

  // A non-2xx or missing response_hex both mean "not indexed yet" here — the DA Layer returns an
  // error body until the submitting round has actually been processed, same as the CLI script's
  // jq-based ".response_hex // null" check.
  if (!res.ok) return null;
  const json = await res.json();
  if (typeof json.response_hex !== "string" || !Array.isArray(json.proof)) return null;

  const [data] = decodeAbiParameters([WEB2JSON_RESPONSE_ABI_PARAMETER], json.response_hex as Hex);
  return { merkleProof: json.proof as Hex[], data: data as unknown as Web2JsonResponse };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const WEATHER_PROOF_POLL_INTERVAL_MS = 15_000;
export const WEATHER_PROOF_MAX_POLL_ATTEMPTS = 20; // 15s x 20 = 5 minutes

/** Polls the DA Layer every WEATHER_PROOF_POLL_INTERVAL_MS until a proof is available or
 * WEATHER_PROOF_MAX_POLL_ATTEMPTS is exhausted. `onAttempt` fires before each attempt so the
 * caller can render progress (e.g. "Waiting for proof... (3/20)"). */
export async function waitForWeatherProof(
  abiEncodedRequest: Hex,
  onAttempt?: (attempt: number, maxAttempts: number) => void
): Promise<WeatherProof> {
  for (let attempt = 1; attempt <= WEATHER_PROOF_MAX_POLL_ATTEMPTS; attempt++) {
    onAttempt?.(attempt, WEATHER_PROOF_MAX_POLL_ATTEMPTS);
    const proof = await pollWeatherProof(abiEncodedRequest);
    if (proof) return proof;
    if (attempt < WEATHER_PROOF_MAX_POLL_ATTEMPTS) await sleep(WEATHER_PROOF_POLL_INTERVAL_MS);
  }
  throw new Error("Timed out waiting for the DA Layer to index the proof (5 minutes).");
}
