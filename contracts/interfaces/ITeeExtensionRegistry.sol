// SPDX-License-Identifier: MIT
pragma solidity >=0.7.6 <0.9;

// TODO: Replace this minimal interface with the full import once flare-smart-contracts-v2
// is published as a package:
//   import { ITeeExtensionRegistry } from "flare-smart-contracts-v2/contracts/userInterfaces/tee/ITeeExtensionRegistry.sol";
//
// Copied verbatim from flare-foundation/fce-weather-insurance (2026-07-20 revision) —
// this is the newer registry ABI (nextPublicExtensionId + FIRST_PUBLIC_EXTENSION_ID
// range) vs. flare-foundation/fce-orderbook's older extensionsCounter() version
// (2026-05-22). Verify which is actually live on Coston2 before deploying.
interface ITeeExtensionRegistry {
    struct TeeInstructionParams {
        bytes32 opType;
        bytes32 opCommand;
        bytes message;
        address[] cosigners;
        uint64 cosignersThreshold;
        address claimBackAddress;
    }

    function sendInstructions(
        address[] calldata _teeIds,
        TeeInstructionParams calldata _instructionParams
    ) external payable returns (bytes32 _instructionId);

    function nextPublicExtensionId() external view returns (uint256);

    function getTeeExtensionInstructionsSender(uint256 _extensionId)
        external view returns (address);
}
