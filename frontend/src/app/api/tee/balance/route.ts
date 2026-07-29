import type { NextRequest } from "next/server";

// Proxies balance lookups to the simulated TEE's own balance API
// (extension/src/server.ts's Express server, Step 2) — a different upstream
// from TEE_PROXY_URL (the official tee-proxy used by ../result/route.ts,
// which has no /balance route). Mirrors that route's CORS-avoidance pattern,
// but degrades to a fallback payload instead of an error status on failure,
// so the client can fall back to the Blockscout-estimated balance without
// having to special-case network errors itself.
const TEE_BALANCE_URL = process.env.TEE_BALANCE_URL;

const FALLBACK = { available: "0", locked: "0", fallback: true };

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");

  if (!address) {
    return Response.json({ error: "address query param is required" }, { status: 400 });
  }
  if (!TEE_BALANCE_URL) {
    return Response.json(FALLBACK);
  }

  const upstreamUrl = `${TEE_BALANCE_URL.replace(/\/$/, "")}/balance?address=${encodeURIComponent(
    address
  )}`;

  try {
    const upstream = await fetch(upstreamUrl, { cache: "no-store" });
    if (!upstream.ok) {
      return Response.json(FALLBACK);
    }
    const body = await upstream.json();
    return Response.json(body);
  } catch {
    return Response.json(FALLBACK);
  }
}
