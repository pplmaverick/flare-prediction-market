# Flare Confidential Prediction Market

Hackathon project: a prediction market on FTSO price feeds (starting with BTC/USD),
settled by a Flare Confidential Compute (FCC) TEE extension. Users bet on price
direction; bet amount/side can optionally be submitted encrypted so the book stays
private until settlement.

Status: **skeleton only** — no contract, extension, or frontend logic written yet.
See the architecture notes below and the design discussion in project history for
the interface decisions still open.

## Layout

```
contracts/    Solidity — PredictionMarket.sol (FCC InstructionSender + vault)
extension/    TypeScript — TEE-side extension server (bet ledger, FTSO read, settlement signing)
frontend/     Next.js — wallet connect, market list, place bet, claim winnings
config/proxy/ TEE proxy config (Coston2 indexer DB connection — see .example)
docker-compose.yml   redis + ext-proxy + extension-tee, modeled on fce-extension-scaffold
```

## Reference repos (read for architecture, not copied wholesale)

- `flare-foundation/fce-extension-scaffold` — extension lifecycle, OPType/OPCommand
  routing, deploy/register/test scripts, docker-compose pattern
- `flare-foundation/fce-orderbook` — vault deposit/withdraw with TEE-signed
  withdrawal authorization (`executeWithdrawal`), replay protection
- `flare-foundation/fce-weather-insurance` — ECIES-encrypted private policy terms,
  TEE ActionResult signature verification pattern (`settle`, `relayPrivateBuy`)
- `ethglobalcannes/fce-sign` — TEE extension reading FTSO via `ContractRegistry` +
  `getFeedByIdInWei`, EIP-712 signed pricing output

None of the reference repos are TypeScript — scaffold/orderbook/weather-insurance
are Go, fce-sign is Python. The `extension/` TEE server here is a from-scratch
TypeScript reimplementation of the same wire protocol (HTTP `/action` handler,
OPType/OPCommand routing, ActionResult signing) — see project report for the
protocol details we're reproducing.

## Setup (not yet run)

```bash
cp config/proxy/extension_proxy.coston2.toml.example config/proxy/extension_proxy.coston2.toml
# fill in indexer DB credentials — see project notes, NOT committed
cd extension && npm install   # not yet run
cd contracts && forge soldeer install   # not yet run — foundry.toml is a stub
```
