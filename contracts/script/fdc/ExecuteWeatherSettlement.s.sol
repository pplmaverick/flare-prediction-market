// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { Script } from "forge-std/Script.sol";
import { Base as FdcBase } from "./Base.s.sol";
import { IWeb2Json } from "flare-periphery/src/coston2/IWeb2Json.sol";
import { ContractRegistry } from "flare-periphery/src/coston2/ContractRegistry.sol";
import { IFdcVerification } from "flare-periphery/src/coston2/IFdcVerification.sol";
import { PredictionMarket } from "../../src/PredictionMarket.sol";

string constant dirPath = "script/fdc/data/";
string constant attestationTypeName = "Web2Json";

/// @dev Coston2 deployment — see README.md "Deployed Contracts".
address constant PREDICTION_MARKET_ADDRESS = 0x9C22c9F1954f2E1D7B305c0E2932edEBE713bDc3;

/// STEP 3: Wait for the submitting round to finalize, pull the Merkle proof from the DA Layer,
/// and call PredictionMarket.requestWeatherSettlement() with it — same on-chain effect as
/// finalize-settlement-panel.tsx's "Request settlement" button does for PRICE markets.
/// Run:
///      forge script script/fdc/ExecuteWeatherSettlement.s.sol \
///        --rpc-url coston2 --broadcast --ffi
contract ExecuteWeatherSettlement is Script {
    /// @notice TEE instruction fee forwarded with the call (see
    /// finalize-settlement-panel.tsx's "Network fee (C2FLR)" field, which defaults to 0.05).
    /// Confirmed 2026-07-28: the TeeExtensionRegistry does require a nonzero fee — 0 reverts
    /// with custom error 0x732f9413 (FeeTooLow), matching the deposit()/placeBet() gotcha
    /// documented in the root README's Implementation Notes.
    uint256 internal constant TEE_INSTRUCTION_FEE = 0.05 ether;

    function run() external {
        string memory requestHex = vm.readLine(
            string.concat(dirPath, attestationTypeName, "_abiEncodedRequest.txt")
        );
        uint256 votingRoundId = FdcBase.stringToUint(
            vm.readLine(string.concat(dirPath, attestationTypeName, "_votingRoundId.txt"))
        );
        uint256 marketId = FdcBase.stringToUint(
            vm.readLine(string.concat(dirPath, attestationTypeName, "_marketId.txt"))
        );

        IFdcVerification fdcVerification = ContractRegistry.getFdcVerification();
        uint8 protocolId = fdcVerification.fdcProtocolId();

        bytes memory proofData = FdcBase.retrieveProof(protocolId, requestHex, votingRoundId);

        FdcBase.ParsableProof memory parsableProof = abi.decode(proofData, (FdcBase.ParsableProof));
        IWeb2Json.Response memory proofResponse = abi.decode(parsableProof.responseHex, (IWeb2Json.Response));
        IWeb2Json.Proof memory proof = IWeb2Json.Proof(parsableProof.proofs, proofResponse);

        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);
        PredictionMarket(PREDICTION_MARKET_ADDRESS).requestWeatherSettlement{ value: TEE_INSTRUCTION_FEE }(
            marketId,
            proof
        );
        vm.stopBroadcast();
    }
}
