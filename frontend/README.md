# frontend/

Next.js 16 (App Router, TypeScript, Tailwind v4) dApp for the Flare
Prediction Market — wallet connect, market list/detail, encrypted bet
placement, vault deposit/withdraw, and market creation.

## Stack

- Next.js 16 + React 19, App Router, mostly client components (wagmi/viem
  need the browser wallet — there's little to gain from Server Components
  here).
- wagmi + viem for wallet connection (injected/MetaMask) and contract reads
  / writes against Coston2 (chain id 114).
- `@noble/secp256k1` + `@noble/hashes` + WebCrypto for client-side ECIES bet
  encryption — see `src/lib/ecies.ts`.
- Hand-rolled UI primitives (`src/components/ui/`) on Radix primitives +
  Tailwind, not a full shadcn install.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in NEXT_PUBLIC_TEE_PUBKEY_X/Y, TEE_PROXY_URL
npm run dev
```

## Known gaps (by design, not oversight)

- **TEE public key isn't auto-discovered.** It isn't derivable from
  `teeAddress()` (a one-way hash) and there's no documented public endpoint
  in this repo to fetch it from. Configure `NEXT_PUBLIC_TEE_PUBKEY_X/Y`
  manually — the simulated extension (`extension/src/server.ts`) prints
  these to its own console on boot.
- **Bet encryption targets `SIMULATED_TEE=true`.** `src/lib/ecies.ts`
  reproduces the `eccrypto` wire format the simulated extension expects.
  A real attested TEE uses a different profile (AES-128-CTR, NIST concat
  KDF) per the root README's Implementation Notes — swap that module before
  pointing this UI at a real (non-simulated) TEE.
- **Settlement/withdrawal finalization needs a live TEE proxy.** Both flows
  fetch a signed result via `app/api/tee/result/route.ts`, which proxies to
  `TEE_PROXY_URL` (server-only env var, avoids browser CORS). If that proxy
  isn't reachable, the UI falls back to manual entry of the result fields.
- **WEATHER settlement isn't wired up.** It needs an FDC Web2Json proof
  obtained off-chain (prepare → submit → retrieve from the DA Layer) — use
  the `contracts/` Foundry scripts for that flow; the UI shows a disabled
  state with an explanation instead of faking it.
