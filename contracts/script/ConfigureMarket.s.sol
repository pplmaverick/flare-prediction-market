// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { Script, console } from "forge-std/Script.sol";
import { PredictionMarket } from "../src/PredictionMarket.sol";

/// @notice STEP 2 of redeploying PredictionMarket — run this AFTER:
///   (a) Deploy.s.sol has deployed the contract, and
///   (b) fce-extension-scaffold's `register-extension` tool has registered that address on
///       FlareTeeManager (see Deploy.s.sol's printed next-steps), and
///   (c) the extension-tee container is running this repo's Part 3 changes and you have its
///       current TEE address (rotates on every container restart — see README.md's
///       Implementation Notes for how to derive it from /info's teeInfo.publicKey).
///
/// Calls setExtensionId() (only works now that step (b) above has actually registered this
/// contract — before that it reverts "Extension ID not found."), setTeeAddress(), and
/// setPayToken() in one broadcast.
///
/// Run:
///      PREDICTION_MARKET_ADDRESS=0x... TEE_ADDRESS=0x... PAY_TOKEN_ADDRESS=0x... \
///        forge script script/ConfigureMarket.s.sol --rpc-url coston2 --broadcast
///
/// PAY_TOKEN_ADDRESS can reuse the same pooled ERC-20 the previous deployment used
/// (0xC1A5B41512496B80903D1f32d6dEa3a73212E71F on Coston2 as of 2026-07-27 — confirm it's still
/// the token you want with `cast call <old address> "payToken()(address)"` before reusing it).
contract ConfigureMarket is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address marketAddress = vm.envAddress("PREDICTION_MARKET_ADDRESS");
        address teeAddress = vm.envAddress("TEE_ADDRESS");
        address payTokenAddress = vm.envAddress("PAY_TOKEN_ADDRESS");

        PredictionMarket market = PredictionMarket(marketAddress);

        vm.startBroadcast(deployerPrivateKey);
        market.setExtensionId();
        market.setTeeAddress(teeAddress);
        market.setPayToken(payTokenAddress);
        vm.stopBroadcast();

        console.log("Configured PredictionMarket at:", marketAddress);
        console.log("teeAddress:", teeAddress);
        console.log("payToken:", payTokenAddress);
    }
}
