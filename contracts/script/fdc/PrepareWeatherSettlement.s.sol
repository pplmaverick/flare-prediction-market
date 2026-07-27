// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { Script } from "forge-std/Script.sol";
import { Base as FdcBase } from "./Base.s.sol";
import { PredictionMarket } from "../../src/PredictionMarket.sol";

string constant dirPath = "script/fdc/data/";
string constant attestationTypeName = "Web2Json";
string constant sourceName = "PublicWeb2";

/// @dev Coston2 deployment — see README.md "Deployed Contracts".
address constant PREDICTION_MARKET_ADDRESS = 0x9C22c9F1954f2E1D7B305c0E2932edEBE713bDc3;

// jq filter producing PredictionMarket.WeatherDataTransportObject's field shape
// (latitude, longitude, temperatureCelsiusE2), in that order. Uses `round` (not `floor`) to
// match frontend/src/app/create/page.tsx's `Math.round(x * 1e6)` / `Math.round(x * 100)`
// encoding — floor would round a value like -80.1918 down to the wrong integer whenever
// floating-point arithmetic lands a hair below the true multiple (e.g. -80191800.000001 ->
// -80191801). `.main.temp` is Kelvin (queryParams below requests `units=standard`, OpenWeatherMap's
// explicit Kelvin mode rather than relying on the API's undocumented no-units-param default) —
// subtracting 273.15 before scaling gives signed Celsius x100, so winter buckets below 0°C decode
// correctly (Market.referenceValue / WeatherDataTransportObject.temperatureCelsiusE2 are int256).
string constant POST_PROCESS_JQ =
    // solhint-disable-next-line max-line-length
    '{latitude: (.coord.lat*1000000|round), longitude: (.coord.lon*1000000|round), temperatureCelsiusE2: ((.main.temp-273.15)*100|round)}';

// ABI signature matching PredictionMarket.WeatherDataTransportObject exactly (field
// names/order/types) — the FDC verifier ABI-encodes the postProcessJq output per this shape.
string constant ABI_SIGNATURE =
    // solhint-disable-next-line max-line-length
    '{\\"components\\": [{\\"internalType\\": \\"int256\\", \\"name\\": \\"latitude\\", \\"type\\": \\"int256\\"},{\\"internalType\\": \\"int256\\", \\"name\\": \\"longitude\\", \\"type\\": \\"int256\\"},{\\"internalType\\": \\"int256\\", \\"name\\": \\"temperatureCelsiusE2\\", \\"type\\": \\"int256\\"}],\\"name\\": \\"dto\\",\\"type\\": \\"tuple\\"}';

/// STEP 1: Build the OpenWeatherMap Web2Json attestation request for a WEATHER market and save
/// the verifier's abiEncodedRequest to a file. Read-only against the chain (no broadcast) — only
/// talks to the Verifier API over HTTP.
/// Run:
///      forge script script/fdc/PrepareWeatherSettlement.s.sol \
///        --rpc-url coston2 --ffi --sig "run(uint256)" <MARKET_ID>
contract PrepareWeatherSettlement is Script {
    function run(uint256 marketId) external {
        vm.createDir(dirPath, true);

        PredictionMarket market = PredictionMarket(PREDICTION_MARKET_ADDRESS);
        PredictionMarket.Market memory m = market.getMarket(marketId);
        require(m.marketType == PredictionMarket.MarketType.WEATHER, "market is not a WEATHER market");
        require(!m.settled, "market already settled");
        require(block.timestamp >= m.expirationTimestamp, "market not expired yet");

        bytes memory abiEncodedRequest = _prepareFdcRequest(m.latitude, m.longitude);

        FdcBase.writeToFile(
            dirPath,
            string.concat(attestationTypeName, "_abiEncodedRequest"),
            FdcBase.toHexString(abiEncodedRequest),
            true
        );
        FdcBase.writeToFile(dirPath, string.concat(attestationTypeName, "_marketId"), vm.toString(marketId), true);
    }

    function _prepareFdcRequest(int256 lat, int256 lon) private returns (bytes memory) {
        string memory requestBody = _prepareApiRequestBody(lat, lon);

        (string[] memory headers, string memory body) = FdcBase.prepareAttestationRequest(
            FdcBase.toUtf8HexString(attestationTypeName),
            FdcBase.toUtf8HexString(sourceName),
            requestBody
        );

        string memory url = string.concat(
            vm.envString("VERIFIER_URL_TESTNET"),
            "/verifier/web2/Web2Json/prepareRequest"
        );
        (, bytes memory data) = FdcBase.postAttestationRequest(url, headers, body);

        FdcBase.AttestationResponse memory response = FdcBase.parseAttestationRequest(data);
        require(
            keccak256(bytes(response.status)) == keccak256(bytes("VALID")),
            string.concat("Verifier API error: ", response.status)
        );
        return response.abiEncodedRequest;
    }

    /// @dev Coordinates come straight off the on-chain market (already 1e6-scaled, matching
    /// frontend/src/app/create/page.tsx's encoding) so the proof's lat/lon will match exactly
    /// what PredictionMarket.requestWeatherSettlement checks against.
    function _prepareApiRequestBody(int256 lat, int256 lon) private view returns (string memory) {
        string memory apiKey = vm.envString("OPEN_WEATHER_API_KEY");
        require(bytes(apiKey).length > 0, "OPEN_WEATHER_API_KEY not set in .env");

        string memory latStr = FdcBase.fromInt(lat, 6);
        string memory lonStr = FdcBase.fromInt(lon, 6);

        // Nested JSON-as-string: every quote one level deeper than the outer request JSON, so
        // each `"` here is escaped once (`\\"` in this Solidity source -> literal `\"`).
        // `units=standard` explicitly requests Kelvin (OpenWeatherMap's default when the param is
        // omitted, but explicit here since POST_PROCESS_JQ's `- 273.15` conversion depends on it —
        // `units=metric` would return an already-Celsius value and silently double-convert it).
        string memory queryParams = string.concat(
            '{\\"lat\\":\\"',
            latStr,
            '\\",\\"lon\\":\\"',
            lonStr,
            '\\",\\"units\\":\\"standard\\",\\"appid\\":\\"',
            apiKey,
            '\\"}'
        );

        // Standard double-quoted JSON throughout (no literal single quotes anywhere in the
        // payload) — Surl's curl wrapper wraps the whole body in single quotes for the shell
        // (`-d '<body>'`), so a stray `'` here would break out of that and corrupt the command.
        return
            string.concat(
                '{"url": "https://api.openweathermap.org/data/2.5/weather',
                '","httpMethod": "GET',
                '","headers": "',
                '","queryParams": "',
                queryParams,
                '","body": "{}',
                '","postProcessJq": "',
                POST_PROCESS_JQ,
                '","abiSignature": "',
                ABI_SIGNATURE,
                '"}'
            );
    }
}
