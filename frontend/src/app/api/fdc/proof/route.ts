import type { NextRequest } from "next/server";

// Proxies DA Layer proof lookups server-side — pollWeatherProof (src/lib/fdc.ts) used to call
// ctn2-data-availability.flare.network directly from the browser and hit a CORS failure
// ("Failed to fetch", no retry, killed the whole polling loop on the first attempt). Same fix as
// /api/fdc/prepare's Verifier proxy and /api/tee/result's TEE proxy.
const DA_LAYER_URL = process.env.NEXT_PUBLIC_DA_LAYER_URL;
const DA_LAYER_API_KEY = process.env.NEXT_PUBLIC_DA_LAYER_API_KEY;

export async function POST(request: NextRequest) {
  if (!DA_LAYER_URL) {
    return Response.json({ error: "NEXT_PUBLIC_DA_LAYER_URL is not configured" }, { status: 500 });
  }

  const { requestBytes } = await request.json();
  if (typeof requestBytes !== "string") {
    return Response.json({ error: "requestBytes is required" }, { status: 400 });
  }

  const upstreamUrl = `${DA_LAYER_URL.replace(/\/$/, "")}/api/v1/fdc/proof-by-request-round-raw`;

  try {
    const upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers: { "X-API-KEY": DA_LAYER_API_KEY ?? "", "Content-Type": "application/json" },
      body: JSON.stringify({ requestBytes }),
    });
    const json = await upstream.json();
    // Status is forwarded as-is (alongside the body) so the caller's res.ok check keeps working
    // the same way it did against the DA Layer directly — a non-indexed round still reads as
    // "not ready" rather than a hard error.
    return Response.json(json, { status: upstream.status });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not reach the DA Layer" },
      { status: 502 }
    );
  }
}
