// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

// solhint-disable ordering

import { Vm } from "forge-std/Vm.sol";
import { Surl } from "dependencies/surl-0.0.0/src/Surl.sol";
import { Strings } from "@openzeppelin-contracts/utils/Strings.sol";
import { ContractRegistry } from "flare-periphery/src/coston2/ContractRegistry.sol";
import { IFdcHub } from "flare-periphery/src/coston2/IFdcHub.sol";
import { IFdcRequestFeeConfigurations } from "flare-periphery/src/coston2/IFdcRequestFeeConfigurations.sol";

address constant VM_ADDRESS = address(uint160(uint256(keccak256("hevm cheat code"))));
Vm constant vm = Vm(VM_ADDRESS);

/// @title FDC scripting helpers for the weather settlement flow.
/// @notice Ported from flare-foundry-starter's script/fdcExample/Base.s.sol, trimmed to what
/// PrepareWeatherSettlement/SubmitWeatherSettlement/ExecuteWeatherSettlement need.
/// @dev Round-id lookup uses IRelay.getVotingRoundId() instead of the starter's
/// IFlareSystemsManager.firstVotingRoundStartTs()/votingEpochDurationSeconds() — those aren't
/// exposed on IFlareSystemsManager in flare-periphery 0.1.37 (the version this repo pins);
/// IRelay's helper does the same computation server-side.
library Base {
    using Surl for *;

    struct ParsableProof {
        bytes32 attestationType;
        bytes32[] proofs;
        bytes responseHex;
    }

    struct AttestationResponse {
        bytes abiEncodedRequest;
        string status;
    }

    uint256 private constant PADDED_HEX_STRING_LENGTH = 64;

    //-////////////////////////////////////////////////////////////////////////
    //                          VERIFIER API HELPERS
    //-////////////////////////////////////////////////////////////////////////

    function prepareAttestationRequest(
        string memory attestationType,
        string memory sourceId,
        string memory requestBody
    ) internal view returns (string[] memory headers, string memory body) {
        string memory apiKey = vm.envString("VERIFIER_API_KEY_TESTNET");
        headers = prepareHeaders(apiKey);
        body = prepareBody(attestationType, sourceId, requestBody);
    }

    function prepareHeaders(string memory apiKey) internal pure returns (string[] memory headers) {
        headers = new string[](2);
        headers[0] = string.concat("X-API-KEY: ", apiKey);
        headers[1] = "Content-Type: application/json";
    }

    /// @dev `body` must already be a complete JSON object literal (not a JSON-stringified
    /// string) — it's spliced in verbatim after "requestBody": .
    function prepareBody(
        string memory attestationType,
        string memory sourceId,
        string memory body
    ) internal pure returns (string memory) {
        return
            string.concat(
                '{"attestationType": "',
                attestationType,
                '", "sourceId": "',
                sourceId,
                '", "requestBody": ',
                body,
                "}"
            );
    }

    function postAttestationRequest(
        string memory url,
        string[] memory headers,
        string memory body
    ) internal returns (uint256 status, bytes memory data) {
        (status, data) = url.post(headers, body);
    }

    function parseAttestationRequest(bytes memory data) internal pure returns (AttestationResponse memory response) {
        string memory dataString = string(data);

        // Extract just the status first so a non-VALID response doesn't fail decoding the
        // (absent) abiEncodedRequest field.
        string memory status = abi.decode(vm.parseJson(dataString, ".status"), (string));
        if (keccak256(bytes(status)) != keccak256(bytes("VALID"))) {
            response.status = status;
            return response;
        }

        bytes memory dataJson = vm.parseJson(dataString);
        response = abi.decode(dataJson, (AttestationResponse));
    }

    //-////////////////////////////////////////////////////////////////////////
    //                       ON-CHAIN INTERACTION HELPERS
    //-////////////////////////////////////////////////////////////////////////

    function submitAttestationRequest(bytes memory abiEncodedRequest) internal returns (uint256 timestamp) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        IFdcRequestFeeConfigurations feeConfig = ContractRegistry.getFdcRequestFeeConfigurations();
        uint256 requestFee = feeConfig.getRequestFee(abiEncodedRequest);

        vm.startBroadcast(deployerPrivateKey);
        IFdcHub fdcHub = ContractRegistry.getFdcHub();
        fdcHub.requestAttestation{ value: requestFee }(abiEncodedRequest);
        timestamp = vm.getBlockTimestamp();
        vm.stopBroadcast();
    }

    function calculateRoundId(uint256 timestamp) internal view returns (uint256 roundId) {
        return ContractRegistry.getRelay().getVotingRoundId(timestamp);
    }

    //-////////////////////////////////////////////////////////////////////////
    //                       POLLING & PROOF RETRIEVAL
    //-////////////////////////////////////////////////////////////////////////

    function waitForRoundFinalization(uint8 protocolId, uint256 roundId) internal view {
        require(ContractRegistry.getRelay().isFinalized(protocolId, roundId), "Round not finalized on-chain yet.");
    }

    function retrieveProof(
        uint8 protocolId,
        string memory requestBytesHex,
        uint256 votingRoundId
    ) internal returns (bytes memory) {
        waitForRoundFinalization(protocolId, votingRoundId);

        string memory daLayerUrl = vm.envString("COSTON2_DA_LAYER_URL");
        require(bytes(daLayerUrl).length > 0, "COSTON2_DA_LAYER_URL env var not set");

        string[] memory headers = prepareHeaders(vm.envString("X_API_KEY"));
        // votingRoundId is deliberately omitted: FDC's collection-window mechanic means a
        // request submitted during round N is actually voted into round N's Merkle tree one
        // round later (confirmed empirically 2026-07-28 — round computed at submission time had
        // no Web2Json leaf, round+1 did), so pinning to the submission-time round here is
        // unreliable. requestBytes alone is unique per request (the FdcHub embeds the caller's
        // salt), and the DA Layer's own schema says omitting votingRoundId fetches "the latest
        // matching proof" instead — that's the round-agnostic and correct behavior here.
        string memory body = string.concat(
            '{"requestBytes":"',
            requestBytesHex,
            '"}'
        );
        string memory url = string.concat(daLayerUrl, "/api/v1/fdc/proof-by-request-round-raw");

        (, bytes memory responseData) = postAttestationRequest(url, headers, body);
        string memory responseString = string(responseData);

        // Use jq via ffi to safely check for the ".response_hex" key before attempting to
        // decode the full response — the DA Layer returns an empty/error body until the round
        // has actually been indexed.
        string[] memory jqCommand = new string[](3);
        jqCommand[0] = "bash";
        jqCommand[1] = "-c";
        jqCommand[2] = string.concat("echo '", responseString, "' | jq -r '.response_hex // \"null\"'");
        bytes memory validationResult = vm.ffi(jqCommand);

        require(keccak256(validationResult) != keccak256(bytes("null")), "Proof not available yet from DA Layer.");

        bytes memory parsedProofData = parseData(responseData);
        require(parsedProofData.length > 0, "Failed to parse proof from DA Layer response.");
        return parsedProofData;
    }

    function parseData(bytes memory data) internal pure returns (bytes memory) {
        return vm.parseJson(string(data));
    }

    //-////////////////////////////////////////////////////////////////////////
    //                            STRING UTILITIES
    //-////////////////////////////////////////////////////////////////////////

    function toUtf8HexString(string memory _string) internal pure returns (string memory) {
        string memory encodedString = toHexString(abi.encodePacked(_string));
        uint256 stringLength = bytes(encodedString).length;
        require(stringLength <= PADDED_HEX_STRING_LENGTH, "String too long for 32-byte padding");
        uint256 paddingLength = PADDED_HEX_STRING_LENGTH - stringLength + 2; // +2 for "0x"
        for (uint256 i = 0; i < paddingLength; i++) {
            encodedString = string.concat(encodedString, "0");
        }
        return encodedString;
    }

    function toHexString(bytes memory data) internal pure returns (string memory) {
        bytes memory alphabet = "0123456789abcdef";
        bytes memory str = new bytes(2 + data.length * 2);
        str[0] = "0";
        str[1] = "x";
        for (uint256 i = 0; i < data.length; i++) {
            str[2 + i * 2] = alphabet[uint256(uint8(data[i] >> 4))];
            str[3 + i * 2] = alphabet[uint256(uint8(data[i] & 0x0f))];
        }
        return string(str);
    }

    /// @notice Converts a 1eN fixed-point int256 (as used for Market.latitude/longitude, see
    /// frontend/src/app/create/page.tsx's `* 1e6` encoding) into a zero-padded decimal string
    /// suitable for a query-string value, e.g. fromInt(-80191800, 6) -> "-80.191800".
    function fromInt(int256 value, uint8 decimals) internal pure returns (string memory) {
        bool negative = value < 0;
        uint256 absValue = uint256(negative ? -value : value);
        uint256 base = 10 ** decimals;
        uint256 integerPart = absValue / base;
        uint256 fractionalPart = absValue % base;

        string memory fractionalStr = Strings.toString(fractionalPart);
        uint256 pad = decimals - bytes(fractionalStr).length;
        for (uint256 i = 0; i < pad; i++) {
            fractionalStr = string.concat("0", fractionalStr);
        }

        string memory result = string.concat(Strings.toString(integerPart), ".", fractionalStr);
        return negative ? string.concat("-", result) : result;
    }

    function stringToUint(string memory s) internal pure returns (uint256 result) {
        bytes memory b = bytes(s);
        for (uint256 i = 0; i < b.length; i++) {
            uint8 c = uint8(b[i]);
            require(c >= 48 && c <= 57, "String contains non-digit characters");
            result = result * 10 + (c - 48);
        }
    }

    //-////////////////////////////////////////////////////////////////////////
    //                                MISC
    //-////////////////////////////////////////////////////////////////////////

    function writeToFile(string memory dirPath, string memory fileName, string memory content, bool newFile) internal {
        require(vm.isDir(dirPath), string.concat("Directory does not exist: ", dirPath));
        string memory filePath = string.concat(dirPath, fileName, ".txt");
        if (newFile) {
            vm.writeFile(filePath, content);
        } else {
            vm.writeLine(filePath, content);
        }
    }
}
