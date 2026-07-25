# contracts/

`src/PredictionMarket.sol` not written yet — interface design is in the project
report, pending confirmation on the open questions listed there (settlement
price source, payout-pool math, ERC-20 vs native token).

`interfaces/` will hold `ITeeExtensionRegistry.sol` and `ITeeMachineRegistry.sol`
— the standard Flare registry ABI stubs every FCC extension needs (copied
verbatim from the reference repos; these are infrastructure boilerplate, not
project-specific logic).

`test/` — Foundry tests, once the contract exists.
