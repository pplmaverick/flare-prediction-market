const GEOCODING_ENDPOINT = "https://geocoding-api.open-meteo.com/v1/search";

export interface CityGeocodeResult {
  name: string;
  country: string;
  latitude: number;
  longitude: number;
}

interface OpenMeteoResult {
  name: string;
  country?: string;
  latitude: number;
  longitude: number;
}

interface OpenMeteoResponse {
  results?: OpenMeteoResult[];
}

/** City-name -> candidate lat/lon lookup via Open-Meteo's geocoding API — free, keyless, and
 * CORS-enabled, so this is called straight from the browser (see create-market's city search). */
export async function searchCities(query: string): Promise<CityGeocodeResult[]> {
  const url = `${GEOCODING_ENDPOINT}?name=${encodeURIComponent(query)}&count=5&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo geocoding request failed: ${res.status}`);
  const data = (await res.json()) as OpenMeteoResponse;
  return (data.results ?? [])
    .filter((r): r is OpenMeteoResult & { country: string } => !!r.country)
    .map((r) => ({ name: r.name, country: r.country, latitude: r.latitude, longitude: r.longitude }));
}
