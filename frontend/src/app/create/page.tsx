"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { decodeEventLog, encodeAbiParameters } from "viem";
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { CloudRain, CurrencyCircleDollar, MagnifyingGlass, MapPin, Plus, PlusCircle, X } from "@phosphor-icons/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { predictionMarketContract, MarketType } from "@/lib/contract";
import { BUCKET_TEMPLATES, COMMON_FEEDS, DURATION_PRESETS_HOURS, WEATHER_CITIES, encodeFeedId } from "@/lib/format";
import { useCitySearch, useDebouncedValue } from "@/lib/hooks";
import type { CityGeocodeResult } from "@/lib/geocoding";
import { useToast } from "@/components/use-toast";
import { getFriendlyErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

/** x100-scaled template thresholds -> plain °C strings for the editable input row. */
function templateToCelsiusStrings(thresholds: readonly number[]): string[] {
  return thresholds.map((t) => String(t / 100));
}

/** Live preview labels for the bucket editor, from the in-progress (plain °C, possibly blank)
 * threshold strings — "?" stands in for a threshold the user hasn't filled in yet. */
function previewBucketRanges(thresholds: string[]): string[] {
  const t = thresholds.map((v) => v || "?");
  if (t.length === 0) return ["all temperatures"];
  const ranges = [`<${t[0]}°C`];
  for (let i = 1; i < t.length; i++) ranges.push(`${t[i - 1]}–${t[i]}°C`);
  ranges.push(`>${t[t.length - 1]}°C`);
  return ranges;
}

export default function CreateMarketPage() {
  const { isConnected } = useAccount();
  const { toast } = useToast();
  const router = useRouter();

  const [marketKind, setMarketKind] = React.useState<"PRICE" | "WEATHER">("PRICE");
  const [feed, setFeed] = React.useState<string>(COMMON_FEEDS[0]);
  const [customFeed, setCustomFeed] = React.useState("");
  const [citySearchQuery, setCitySearchQuery] = React.useState<string>(WEATHER_CITIES[0].name);
  const [citySearchOpen, setCitySearchOpen] = React.useState(false);
  const [latitude, setLatitude] = React.useState(String(WEATHER_CITIES[0].lat));
  const [longitude, setLongitude] = React.useState(String(WEATHER_CITIES[0].lon));
  const debouncedCityQuery = useDebouncedValue(citySearchQuery, 350);
  const { data: cityResults, isFetching: isCitySearching } = useCitySearch(debouncedCityQuery);
  const [bucketThresholds, setBucketThresholds] = React.useState<string[]>(
    templateToCelsiusStrings(BUCKET_TEMPLATES[0].thresholds)
  );
  const [activeTemplate, setActiveTemplate] = React.useState<string | null>(BUCKET_TEMPLATES[0].name);
  const [durationHours, setDurationHours] = React.useState("24");

  function applyTemplate(name: string) {
    const template = BUCKET_TEMPLATES.find((t) => t.name === name);
    if (!template) return;
    setBucketThresholds(templateToCelsiusStrings(template.thresholds));
    setActiveTemplate(name);
  }

  function updateThreshold(index: number, value: string) {
    setBucketThresholds((prev) => prev.map((v, i) => (i === index ? value : v)));
    setActiveTemplate(null);
  }

  function addThreshold() {
    setBucketThresholds((prev) => [...prev, ""]);
    setActiveTemplate(null);
  }

  function removeThreshold(index: number) {
    setBucketThresholds((prev) => prev.filter((_, i) => i !== index));
    setActiveTemplate(null);
  }

  function selectPresetCity(preset: (typeof WEATHER_CITIES)[number]) {
    setCitySearchQuery(preset.name);
    setLatitude(String(preset.lat));
    setLongitude(String(preset.lon));
    setCitySearchOpen(false);
  }

  function selectCityResult(result: CityGeocodeResult) {
    setCitySearchQuery(`${result.name}, ${result.country}`);
    setLatitude(String(result.latitude));
    setLongitude(String(result.longitude));
    setCitySearchOpen(false);
  }

  const { writeContract, data: hash, isPending } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  React.useEffect(() => {
    if (!receipt.data) return;
    for (const log of receipt.data.logs) {
      try {
        const decoded = decodeEventLog({ abi: predictionMarketContract.abi, data: log.data, topics: log.topics });
        if (decoded.eventName === "MarketCreated") {
          const args = decoded.args as { marketId: bigint };
          toast({ title: "Market created", description: `Market #${args.marketId}`, variant: "success" });
          router.push(`/market/${args.marketId}`);
        }
      } catch {
        // not the event we're looking for
      }
    }
  }, [receipt.data, router, toast]);

  function handleSubmit() {
    const duration = BigInt(Math.round(Number(durationHours) * 3600));
    if (!duration || duration <= 0n) {
      toast({ title: "Invalid duration", description: "Duration must be greater than 0.", variant: "destructive" });
      return;
    }

    if (marketKind === "PRICE") {
      const symbol = feed === "custom" ? customFeed : feed;
      if (!symbol) {
        toast({ title: "Feed required", description: "Pick or enter a feed symbol.", variant: "destructive" });
        return;
      }
      let feedId: `0x${string}`;
      try {
        feedId = encodeFeedId(symbol);
      } catch (error) {
        toast({ title: "Invalid feed symbol", description: getFriendlyErrorMessage(error), variant: "destructive" });
        return;
      }
      const typeParams = encodeAbiParameters([{ type: "bytes21" }], [feedId]);
      writeContract(
        { ...predictionMarketContract, functionName: "createMarket", args: [MarketType.PRICE, typeParams, duration] },
        { onError: (error) => toast({ title: "Create failed", description: getFriendlyErrorMessage(error), variant: "destructive" }) }
      );
    } else {
      if (!latitude || !longitude) {
        toast({ title: "Missing fields", description: "Fill in coordinates.", variant: "destructive" });
        return;
      }
      if (bucketThresholds.length < 2) {
        toast({ title: "Not enough buckets", description: "Need at least 2 thresholds (3 buckets).", variant: "destructive" });
        return;
      }
      if (bucketThresholds.some((v) => v.trim() === "" || Number.isNaN(Number(v)))) {
        toast({ title: "Invalid threshold", description: "Every bucket threshold must be a number.", variant: "destructive" });
        return;
      }
      const thresholdsE2 = bucketThresholds.map((v) => BigInt(Math.round(Number(v) * 100)));
      for (let i = 1; i < thresholdsE2.length; i++) {
        if (thresholdsE2[i] <= thresholdsE2[i - 1]) {
          toast({
            title: "Thresholds must increase",
            description: "Each bucket threshold must be strictly greater than the previous one.",
            variant: "destructive",
          });
          return;
        }
      }

      const lat = BigInt(Math.round(Number(latitude) * 1e6));
      const lon = BigInt(Math.round(Number(longitude) * 1e6));
      const typeParams = encodeAbiParameters(
        [{ type: "int256" }, { type: "int256" }, { type: "int256[]" }],
        [lat, lon, thresholdsE2]
      );
      writeContract(
        { ...predictionMarketContract, functionName: "createMarket", args: [MarketType.WEATHER, typeParams, duration] },
        { onError: (error) => toast({ title: "Create failed", description: getFriendlyErrorMessage(error), variant: "destructive" }) }
      );
    }
  }

  const busy = isPending || receipt.isLoading;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-raised text-primary">
          <PlusCircle size={22} weight="bold" />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Create Market</h1>
          <p className="text-sm text-muted-foreground">Anyone can create a market — no permission needed</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Market Parameters</CardTitle>
          <CardDescription>PRICE markets read their start price from FTSO immediately on creation.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={marketKind} onValueChange={(v) => setMarketKind(v as "PRICE" | "WEATHER")}>
            <TabsList className="mb-5">
              <TabsTrigger value="PRICE">
                <CurrencyCircleDollar size={14} className="mr-1" />
                Price
              </TabsTrigger>
              <TabsTrigger value="WEATHER">
                <CloudRain size={14} className="mr-1" />
                Weather
              </TabsTrigger>
            </TabsList>

            <TabsContent value="PRICE" className="flex flex-col gap-4">
              <div>
                <Label>Feed</Label>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {COMMON_FEEDS.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFeed(f)}
                      className={cn(
                        "cursor-pointer rounded-lg border px-3 py-2 font-mono text-xs transition-colors",
                        feed === f
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border-strong bg-surface-raised text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {f}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setFeed("custom")}
                    className={cn(
                      "cursor-pointer rounded-lg border px-3 py-2 text-xs transition-colors",
                      feed === "custom"
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border-strong bg-surface-raised text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Custom
                  </button>
                </div>
                {feed === "custom" && (
                  <Input
                    className="mt-2"
                    placeholder="e.g. DOGE/USD"
                    value={customFeed}
                    onChange={(e) => setCustomFeed(e.target.value)}
                  />
                )}
              </div>
            </TabsContent>

            <TabsContent value="WEATHER" className="flex flex-col gap-4">
              <div>
                <Label htmlFor="city-search">Location</Label>
                <div className="relative mt-2">
                  <MagnifyingGlass
                    size={14}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    id="city-search"
                    placeholder="Search city..."
                    autoComplete="off"
                    value={citySearchQuery}
                    onChange={(e) => {
                      setCitySearchQuery(e.target.value);
                      setCitySearchOpen(true);
                    }}
                    onFocus={() => setCitySearchOpen(true)}
                    onBlur={() => setTimeout(() => setCitySearchOpen(false), 150)}
                    className="pl-8"
                  />
                  {citySearchOpen && debouncedCityQuery.trim().length >= 2 && (
                    <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border-strong bg-surface shadow-xl shadow-black/30">
                      {isCitySearching ? (
                        <p className="px-3 py-2 text-xs text-muted-foreground">Searching...</p>
                      ) : cityResults && cityResults.length > 0 ? (
                        cityResults.map((r, i) => (
                          <button
                            key={`${r.name}-${r.latitude}-${r.longitude}-${i}`}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              selectCityResult(r);
                            }}
                            className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-raised"
                          >
                            <MapPin size={14} className="shrink-0 text-muted-foreground" />
                            {r.name}, {r.country}
                          </button>
                        ))
                      ) : (
                        <p className="px-3 py-2 text-xs text-muted-foreground">No cities found.</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  {WEATHER_CITIES.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => selectPresetCity(preset)}
                      className={cn(
                        "cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                        citySearchQuery === preset.name
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border-strong bg-surface-raised text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="lat">Latitude</Label>
                    <Input
                      id="lat"
                      readOnly
                      placeholder="—"
                      value={latitude}
                      className="mt-2 cursor-default text-muted-foreground"
                    />
                  </div>
                  <div>
                    <Label htmlFor="lon">Longitude</Label>
                    <Input
                      id="lon"
                      readOnly
                      placeholder="—"
                      value={longitude}
                      className="mt-2 cursor-default text-muted-foreground"
                    />
                  </div>
                </div>
              </div>
              <div>
                <Label>Temperature buckets</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Bettors pick which °C range the settlement temperature will land in. Start from a
                  template or edit thresholds directly.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {BUCKET_TEMPLATES.map((t) => (
                    <button
                      key={t.name}
                      type="button"
                      onClick={() => applyTemplate(t.name)}
                      title={t.hint}
                      className={cn(
                        "cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                        activeTemplate === t.name
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border-strong bg-surface-raised text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>

                <div className="mt-3 flex flex-col gap-2">
                  {bucketThresholds.map((value, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-5 shrink-0 text-right text-xs text-muted-foreground">{i + 1}.</span>
                      <Input
                        type="number"
                        step="any"
                        placeholder="°C"
                        value={value}
                        onChange={(e) => updateThreshold(i, e.target.value)}
                      />
                      <span className="text-xs text-muted-foreground">°C</span>
                      <button
                        type="button"
                        onClick={() => removeThreshold(i)}
                        disabled={bucketThresholds.length <= 2}
                        className="cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:text-destructive disabled:cursor-not-allowed disabled:opacity-30"
                        aria-label="Remove threshold"
                      >
                        <X size={14} weight="bold" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addThreshold}
                    className="mt-1 flex cursor-pointer items-center gap-1.5 self-start rounded-lg border border-dashed border-border-strong px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Plus size={14} weight="bold" />
                    Add threshold
                  </button>
                </div>

                <p className="mt-3 text-xs text-muted-foreground">
                  {bucketThresholds.length + 1} buckets: {previewBucketRanges(bucketThresholds).join(" / ")}
                </p>
              </div>
            </TabsContent>

            <div className="mt-2">
              <Label htmlFor="duration">Duration</Label>
              <Select
                id="duration"
                className="mt-2"
                value={durationHours}
                onValueChange={setDurationHours}
                options={DURATION_PRESETS_HOURS.map((d) => ({ value: String(d.hours), label: d.label }))}
              />
            </div>

            <Button size="lg" className="mt-5 w-full" disabled={!isConnected || busy} onClick={handleSubmit}>
              <PlusCircle size={16} weight="bold" />
              {busy ? "Creating..." : "Create Market"}
            </Button>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
