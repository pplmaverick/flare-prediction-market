import type { NextRequest } from "next/server";

// Proxies the Verifier's prepareRequest call server-side so OPEN_WEATHER_API_KEY (needed in the
// queryParams so the Verifier can live-fetch OpenWeatherMap and compute the request's message
// integrity code) never reaches the browser — same reasoning as /api/tee/result/route.ts's TEE
// proxy indirection.
const VERIFIER_URL = process.env.NEXT_PUBLIC_VERIFIER_URL;
const VERIFIER_API_KEY = process.env.NEXT_PUBLIC_VERIFIER_API_KEY;
const OPEN_WEATHER_API_KEY = process.env.OPEN_WEATHER_API_KEY;

// Padded-hex (bytes32) UTF-8 encodings — see contracts/script/fdc/PrepareWeatherSettlement.s.sol's
// toUtf8HexString("Web2Json") / toUtf8HexString("PublicWeb2"). Fixed constants, not derived at
// runtime.
const ATTESTATION_TYPE_HEX = "0x576562324a736f6e000000000000000000000000000000000000000000000000";
const SOURCE_ID_HEX = "0x5075626c69635765623200000000000000000000000000000000000000000000";

// Exact copy of PrepareWeatherSettlement.s.sol's POST_PROCESS_JQ (the Solidity source there
// escapes `"` as `\"` because it's spliced into a Solidity string literal — not needed in plain
// JS; JSON.stringify below re-escapes it correctly on the wire).
const POST_PROCESS_JQ =
  '{latitude: ((if (.coord.lat*1000000) >= 0 then (.coord.lat*1000000 + 0.5) else (.coord.lat*1000000 - 0.5) end) | tostring | split(".")[0] | tonumber), longitude: ((if (.coord.lon*1000000) >= 0 then (.coord.lon*1000000 + 0.5) else (.coord.lon*1000000 - 0.5) end) | tostring | split(".")[0] | tonumber), temperatureCelsiusE2: ((if ((.main.temp-273.15)*100) >= 0 then ((.main.temp-273.15)*100 + 0.5) else ((.main.temp-273.15)*100 - 0.5) end) | tostring | split(".")[0] | tonumber)}';

// Exact copy of PrepareWeatherSettlement.s.sol's ABI_SIGNATURE — matches
// PredictionMarket.WeatherDataTransportObject's field names/order/types exactly.
const ABI_SIGNATURE =
  '{"components": [{"internalType": "int256", "name": "latitude", "type": "int256"},{"internalType": "int256", "name": "longitude", "type": "int256"},{"internalType": "int256", "name": "temperatureCelsiusE2", "type": "int256"}],"name": "dto","type": "tuple"}';

/** 1e6-scaled fixed-point (Market.latitude/longitude) -> signed decimal string, e.g.
 * 25033000n -> "25.033000". Bigint-exact port of Base.s.sol's fromInt(value, 6), avoiding float
 * rounding so it matches exactly what requestWeatherSettlement's on-chain
 * `dto.latitude == m.latitude` check expects. */
function formatCoordinate(valueE6: bigint): string {
  const negative = valueE6 < 0n;
  const abs = negative ? -valueE6 : valueE6;
  const integerPart = abs / 1_000_000n;
  const fractionalPart = (abs % 1_000_000n).toString().padStart(6, "0");
  const result = `${integerPart}.${fractionalPart}`;
  return negative ? `-${result}` : result;
}

export async function POST(request: NextRequest) {
  if (!OPEN_WEATHER_API_KEY) {
    return Response.json({ error: "OPEN_WEATHER_API_KEY is not configured on the server" }, { status: 500 });
  }
  if (!VERIFIER_URL) {
    return Response.json({ error: "NEXT_PUBLIC_VERIFIER_URL is not configured" }, { status: 500 });
  }

  const { lat, lon } = await request.json();
  if (lat === undefined || lon === undefined) {
    return Response.json({ error: "lat and lon are required" }, { status: 400 });
  }

  let latE6: bigint;
  let lonE6: bigint;
  try {
    latE6 = BigInt(lat);
    lonE6 = BigInt(lon);
  } catch {
    return Response.json({ error: "lat and lon must be integers (1e6-scaled)" }, { status: 400 });
  }

  const queryParams = JSON.stringify({
    lat: formatCoordinate(latE6),
    lon: formatCoordinate(lonE6),
    units: "standard",
    appid: OPEN_WEATHER_API_KEY,
  });

  const verifierBody = {
    attestationType: ATTESTATION_TYPE_HEX,
    sourceId: SOURCE_ID_HEX,
    requestBody: {
      url: "https://api.openweathermap.org/data/2.5/weather",
      httpMethod: "GET",
      headers: "",
      queryParams,
      body: "{}",
      postProcessJq: POST_PROCESS_JQ,
      abiSignature: ABI_SIGNATURE,
    },
  };

  const upstreamUrl = `${VERIFIER_URL.replace(/\/$/, "")}/verifier/web2/Web2Json/prepareRequest`;

  try {
    const upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers: { "X-API-KEY": VERIFIER_API_KEY ?? "", "Content-Type": "application/json" },
      body: JSON.stringify(verifierBody),
    });
    const json = await upstream.json();

    if (!upstream.ok || json.status !== "VALID") {
      return Response.json(
        {
          error:
            typeof json.status === "string" ? `Verifier: ${json.status}` : `Verifier responded ${upstream.status}`,
        },
        { status: 502 }
      );
    }

    return Response.json({ abiEncodedRequest: json.abiEncodedRequest });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not reach the Verifier" },
      { status: 502 }
    );
  }
}
