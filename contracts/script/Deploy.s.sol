// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { Script, console } from "forge-std/Script.sol";
import { PredictionMarket } from "../src/PredictionMarket.sol";
import { ITeeExtensionRegistry } from "../interfaces/ITeeExtensionRegistry.sol";
import { ITeeMachineRegistry } from "../interfaces/ITeeMachineRegistry.sol";

/// @dev FlareTeeManager — Flare's shared Diamond proxy implementing both ITeeExtensionRegistry
/// and ITeeMachineRegistry (same address for both constructor args). Verified against
/// fce-extension-scaffold/config/coston2/deployed-addresses.json and README.md's "Deployed
/// Contracts" table (2026-07-27) — this is Flare-side shared infra, not something this repo
/// deploys, so it stays fixed across redeploys of PredictionMarket itself.
address constant FLARE_TEE_MANAGER_COSTON2 = 0x1a9C4A0f9D76c0b1D91d22E24E573a9b377618aE;

/// @notice STEP 1 of redeploying PredictionMarket. Deploys the contract only — does NOT call
/// setExtensionId()/setTeeAddress()/setPayToken(). Those need a real extension-registry entry
/// and a live TEE, both of which come from OUTSIDE this Foundry project (fce-extension-scaffold's
/// `register-extension` Go tool, then a rebuilt/restarted TEE container) — see ConfigureMarket.s.sol
/// for step 2, and the deploy checklist in README.md for the full ordered sequence.
///
/// Run (dry run first — no --broadcast, just simulates and shows what would happen):
///      forge script script/Deploy.s.sol --rpc-url coston2
/// Then for real:
///      forge script script/Deploy.s.sol --rpc-url coston2 --broadcast
///
/// Requires PRIVATE_KEY in contracts/.env (see contracts/.env.example — same funded Coston2 key
/// used by the FDC settlement scripts; can reuse the root .env's DEPLOYMENT_PRIVATE_KEY value).
contract Deploy is Script {
    function run() external returns (address) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);
        PredictionMarket market = new PredictionMarket(
            ITeeExtensionRegistry(FLARE_TEE_MANAGER_COSTON2),
            ITeeMachineRegistry(FLARE_TEE_MANAGER_COSTON2)
        );
        vm.stopBroadcast();

        console.log("PredictionMarket deployed at:", address(market));
        console.log("");
        console.log("Next steps (see README.md deploy checklist):");
        console.log("1. In fce-extension-scaffold/tools: go run ./cmd/register-extension \\");
        console.log("     -a <ADDRESSES_FILE> -c <CHAIN_URL> --instructionSender", address(market));
        console.log("2. Rebuild + restart the extension-tee container with this repo's Part 3");
        console.log("   changes (old TEE code can't decode the new wire format), re-run register-tee.");
        console.log("3. Get the TEE's current address (from /info's teeInfo.publicKey, per README's");
        console.log("   Implementation Notes) and set PREDICTION_MARKET_ADDRESS + TEE_ADDRESS +");
        console.log("   PAY_TOKEN_ADDRESS env vars, then run ConfigureMarket.s.sol.");

        return address(market);
    }
}
