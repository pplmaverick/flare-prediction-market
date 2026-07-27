// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { Script } from "forge-std/Script.sol";
import { Strings } from "@openzeppelin-contracts/utils/Strings.sol";
import { Base as FdcBase } from "./Base.s.sol";

string constant dirPath = "script/fdc/data/";
string constant attestationTypeName = "Web2Json";

/// STEP 2: Submit the request prepared by PrepareWeatherSettlement to the FdcHub (pays the
/// attestation fee from the broadcasting key) and record the voting round ID it landed in.
/// Run:
///      forge script script/fdc/SubmitWeatherSettlement.s.sol \
///        --rpc-url coston2 --broadcast --ffi
contract SubmitWeatherSettlement is Script {
    function run() external {
        string memory requestHex = vm.readLine(
            string.concat(dirPath, attestationTypeName, "_abiEncodedRequest.txt")
        );
        bytes memory abiEncodedRequest = vm.parseBytes(requestHex);

        uint256 submissionTimestamp = FdcBase.submitAttestationRequest(abiEncodedRequest);
        uint256 votingRoundId = FdcBase.calculateRoundId(submissionTimestamp);

        FdcBase.writeToFile(
            dirPath,
            string.concat(attestationTypeName, "_votingRoundId"),
            Strings.toString(votingRoundId),
            true
        );
    }
}
