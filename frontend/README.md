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
- **Bet encryption targets the real tee-node.** `eciesEncrypt` in
  `src/lib/ecies.ts` implements go-ethereum's `crypto/ecies` with
  `ECIES_AES128_SHA256` params (AES-128-CTR, NIST SP800-56 concatKDF,
  HMAC-SHA256) — verified byte-for-byte on 2026-07-27 by encrypting in JS and
  decrypting with the actual `go-ethereum@v1.17.4`/`tee-node@v0.0.23` code
  paths (see git history for the cross-check script). If you're instead
  testing against `flare-prediction-market/extension/src/server.ts`'s
  `SIMULATED_TEE=true` stub (a different, unrelated stand-in that speaks the
  `eccrypto` wire format), use `eciesEncryptSimulated` from the same file
  instead — it's kept but not wired into any UI component.
- **Settlement/withdrawal finalization needs a live TEE proxy.** Both flows
  fetch a signed result via `app/api/tee/result/route.ts`, which proxies to
  `TEE_PROXY_URL` (server-only env var, avoids browser CORS). If that proxy
  isn't reachable, the UI falls back to manual entry of the result fields.
- **WEATHER settlement isn't wired up.** It needs an FDC Web2Json proof
  obtained off-chain (prepare → submit → retrieve from the DA Layer) — use
  the `contracts/` Foundry scripts for that flow; the UI shows a disabled
  state with an explanation instead of faking it.
