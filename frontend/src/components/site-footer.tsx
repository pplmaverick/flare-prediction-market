import { ArrowSquareOut, GithubLogo } from "@phosphor-icons/react/dist/ssr";
import { PREDICTION_MARKET_ADDRESS } from "@/lib/contract";
import { coston2 } from "@/lib/chain";
import { truncateAddress } from "@/lib/format";

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span>Flare Coston2 Testnet · Chain ID 114</span>
          <a
            href={`${coston2.blockExplorers.default.url}/address/${PREDICTION_MARKET_ADDRESS}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 font-mono text-foreground/80 transition-colors hover:text-foreground"
          >
            {truncateAddress(PREDICTION_MARKET_ADDRESS)}
            <ArrowSquareOut size={12} />
          </a>
        </div>
        <a
          href="https://github.com/pplmaverick"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 transition-colors hover:text-foreground"
        >
          <GithubLogo size={14} />
          pplmaverick
        </a>
      </div>
    </footer>
  );
}
