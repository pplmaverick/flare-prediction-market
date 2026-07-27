"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { decodeEventLog, encodeAbiParameters } from "viem";
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { CloudRain, CurrencyCircleDollar, PlusCircle } from "@phosphor-icons/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { predictionMarketContract, MarketType } from "@/lib/contract";
import { COMMON_FEEDS, DURATION_PRESETS_HOURS, RAIN_THRESHOLD_PRESETS_MM, WEATHER_CITIES, encodeFeedId } from "@/lib/format";
import { useToast } from "@/components/use-toast";
import { getFriendlyErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

const CUSTOM_CITY = "custom";

export default function CreateMarketPage() {
  const { isConnected } = useAccount();
  const { toast } = useToast();
  const router = useRouter();

  const [marketKind, setMarketKind] = React.useState<"PRICE" | "WEATHER">("PRICE");
  const [feed, setFeed] = React.useState<string>(COMMON_FEEDS[0]);
  const [customFeed, setCustomFeed] = React.useState("");
  const [city, setCity] = React.useState<string>(WEATHER_CITIES[0].name);
  const [latitude, setLatitude] = React.useState(String(WEATHER_CITIES[0].lat));
  const [longitude, setLongitude] = React.useState(String(WEATHER_CITIES[0].lon));
  const [rainThreshold, setRainThreshold] = React.useState("");
  const [durationHours, setDurationHours] = React.useState("24");

  function handleCityChange(name: string) {
    setCity(name);
    const preset = WEATHER_CITIES.find((c) => c.name === name);
    if (preset) {
      setLatitude(String(preset.lat));
      setLongitude(String(preset.lon));
    } else {
      setLatitude("");
      setLongitude("");
    }
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
      if (!latitude || !longitude || !rainThreshold) {
        toast({ title: "Missing fields", description: "Fill in coordinates and rain threshold.", variant: "destructive" });
        return;
      }
      const lat = BigInt(Math.round(Number(latitude) * 1e6));
      const lon = BigInt(Math.round(Number(longitude) * 1e6));
      const threshold = BigInt(Math.round(Number(rainThreshold) * 100));
      const typeParams = encodeAbiParameters(
        [{ type: "int256" }, { type: "int256" }, { type: "uint256" }],
        [lat, lon, threshold]
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
                <Label htmlFor="city">Location</Label>
                <Select
                  id="city"
                  className="mt-2"
                  value={city}
                  onValueChange={handleCityChange}
                  options={[
                    ...WEATHER_CITIES.map((c) => ({ value: c.name, label: c.name })),
                    { value: CUSTOM_CITY, label: "Custom..." },
                  ]}
                />
                {city === CUSTOM_CITY ? (
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="lat">Latitude</Label>
                      <Input
                        id="lat"
                        type="number"
                        step="any"
                        placeholder="25.033"
                        value={latitude}
                        onChange={(e) => setLatitude(e.target.value)}
                        className="mt-2"
                      />
                    </div>
                    <div>
                      <Label htmlFor="lon">Longitude</Label>
                      <Input
                        id="lon"
                        type="number"
                        step="any"
                        placeholder="121.565"
                        value={longitude}
                        onChange={(e) => setLongitude(e.target.value)}
                        className="mt-2"
                      />
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Coordinates: {latitude}, {longitude}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="rain">Rain threshold (mm)</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Bet YES if rainfall exceeds this amount during the market period
                </p>
                <Input
                  id="rain"
                  type="number"
                  step="any"
                  placeholder="10"
                  value={rainThreshold}
                  onChange={(e) => setRainThreshold(e.target.value)}
                  className="mt-2"
                />
                <div className="mt-2 flex gap-2">
                  {RAIN_THRESHOLD_PRESETS_MM.map((mm) => (
                    <button
                      key={mm}
                      type="button"
                      onClick={() => setRainThreshold(String(mm))}
                      className={cn(
                        "cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                        rainThreshold === String(mm)
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border-strong bg-surface-raised text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {mm}mm
                    </button>
                  ))}
                </div>
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
