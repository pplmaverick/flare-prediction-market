# extension/

No FCC scaffold ships a TypeScript template — `fce-extension-scaffold` and
`fce-orderbook`/`fce-weather-insurance` are Go, `fce-sign` (ethglobalcannes) is
Python. This is a from-scratch TS reimplementation of the same wire protocol:

- `POST /action` — TEE node forwards decoded instructions here (mirrors Go's
  `internal/extension/extension.go` `processAction()` router: switch on OPType,
  sub-route on OPCommand)
- `GET /state` — observable extension state for TEE sync
- Reads FTSO directly via `ContractRegistry.getContractAddressByName("FtsoV2")`
  → `getFeedByIdInWei` (same pattern as `fce-sign`'s `get_ftso_spot.py`, just a
  plain RPC view call — nothing TEE-specific about this step by itself)
- Signs `ActionResult` for `settle`/`withdraw` the way `fce-orderbook` and
  `fce-weather-insurance` do: EIP-191/EIP-712 signature over a domain-separated
  hash, verified on-chain via `ecrecover` against the registered `teeAddress`

Nothing implemented yet — `src/index.ts` is a stub.
