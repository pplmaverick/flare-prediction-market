import type { NextRequest } from "next/server";

// Proxies action-result lookups to the TEE proxy's external port, avoiding
// browser CORS — mirrors the pattern documented in frontend/README.md
// (originally: fce-weather-insurance/frontend proxying TEE /info and
// /action/result through Next API routes). Endpoint shape per root
// README.md's Implementation Notes: `GET /action/result/{actionId}
// ?submissionTag=threshold` on the proxy's *external* port.
const TEE_PROXY_URL = process.env.TEE_PROXY_URL ?? process.env.NORMAL_PROXY_URL;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const actionId = searchParams.get("actionId");
  const submissionTag = searchParams.get("submissionTag") ?? "threshold";

  if (!actionId) {
    return Response.json({ error: "actionId query param is required" }, { status: 400 });
  }
  if (!TEE_PROXY_URL) {
    return Response.json(
      { error: "TEE_PROXY_URL (or NORMAL_PROXY_URL) is not configured on the server" },
      { status: 500 }
    );
  }

  const upstreamUrl = `${TEE_PROXY_URL.replace(/\/$/, "")}/action/result/${encodeURIComponent(
    actionId
  )}?submissionTag=${encodeURIComponent(submissionTag)}`;

  try {
    const upstream = await fetch(upstreamUrl, { cache: "no-store" });
    const text = await upstream.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // leave as raw text — surfaced as-is so the caller can inspect it
    }

    if (!upstream.ok) {
      return Response.json(
        { error: `TEE proxy responded with ${upstream.status}`, body },
        { status: 502 }
      );
    }
    return Response.json({ body });
  } catch (error) {
    return Response.json(
      {
        error: "Could not reach the TEE proxy",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 502 }
    );
  }
}
