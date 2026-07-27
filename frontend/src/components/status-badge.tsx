import { Badge } from "@/components/ui/badge";
import { CheckCircle, Clock, HourglassMedium } from "@phosphor-icons/react/dist/ssr";
import type { MarketStatus } from "@/lib/market";

const STATUS_CONFIG: Record<
  MarketStatus,
  { label: string; variant: "accent" | "warning" | "neutral"; icon: typeof Clock }
> = {
  open: { label: "Open", variant: "accent", icon: Clock },
  awaiting_settlement: { label: "Awaiting Settlement", variant: "warning", icon: HourglassMedium },
  settled: { label: "Settled", variant: "neutral", icon: CheckCircle },
};

export function StatusBadge({ status }: { status: MarketStatus }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  return (
    <Badge variant={config.variant}>
      <Icon size={12} weight="bold" />
      {config.label}
    </Badge>
  );
}
