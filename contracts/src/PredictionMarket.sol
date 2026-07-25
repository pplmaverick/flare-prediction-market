// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { ITeeExtensionRegistry } from "../interfaces/ITeeExtensionRegistry.sol";
import { ITeeMachineRegistry } from "../interfaces/ITeeMachineRegistry.sol";
import { IWeb2Json } from "flare-periphery/src/coston2/IWeb2Json.sol";
import { ContractRegistry } from "flare-periphery/src/coston2/ContractRegistry.sol";
import { TestFtsoV2Interface } from "flare-periphery/src/coston2/TestFtsoV2Interface.sol";

/// @notice Minimal ERC-20 surface for the pooled stake token (matches the local-interface
/// pattern used by fce-orderbook / fce-weather-insurance instead of pulling in OpenZeppelin).
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title PredictionMarket
/// @author (hackathon skeleton)
/// @notice Dual-market confidential prediction platform on Flare Confidential Compute (FCC).
///
/// PRICE markets settle against an FTSO feed (e.g. BTC/USD); WEATHER markets settle against
/// an FDC Web2Json attestation (OpenWeatherMap). Both "what actually happened" checks are
/// resolved **on-chain, independent of the TEE** — FTSO is a public view call, FDC is a
/// Merkle-proof verified by `IFdcVerification.verifyWeb2Json`. The TEE's job is uniform across
/// both market types and only that: decrypt the private bet ledger for a market, compute each
/// bettor's payout once the outcome is known, and sign the result. Because the outcome is
/// always resolved before the TEE is asked to act, `requestSettlement` is market-type-specific
/// (the proof/read shape differs) but the wire message sent to the TEE, and the OP_COMMAND used,
/// is identical for both — see OP_COMMAND_SETTLE below.
///
/// Bet placement (`placeBet`) is deliberately an on-chain instruction (not an off-chain direct
/// action) — modeled on fce-weather-insurance's `buyPolicyPrivate`, not fce-orderbook's
/// PLACE_ORDER. Reasoning: bets are a single decisive action per market (unlike orderbook quotes
/// that are placed/cancelled rapidly), and having the *existence and timestamp* of a bet on-chain
/// (even though its contents are ECIES-encrypted) matters for prediction-market fairness — e.g.
/// proving no one could bet after expiration.
///
/// Deposit/withdraw follow fce-orderbook's vault model exactly: this contract only custodies the
/// pooled payToken total. Per-user available/locked balances live entirely in TEE memory, never
/// on-chain. Withdrawals are authorized purely by a TEE signature over a specific
/// (amount, to, withdrawalId) tuple — the vault does not need to know a caller's balance, only
/// that the TEE said so, once, for that withdrawalId (replay-protected).
///
/// DO NOT MODIFY: constructor wiring, setExtensionId(), _getExtensionId() — copied verbatim
/// from the reference registry-wiring pattern in fce-weather-insurance.
contract PredictionMarket {
    // --- FCC operation identifiers (must match extension/'s OPType/OPCommand config) ---

    // forge-lint: disable-next-line(unsafe-typecast)
    bytes32 public constant OP_TYPE_PREDICTION_MARKET = bytes32("PREDICTION_MARKET");
    // forge-lint: disable-next-line(unsafe-typecast)
    bytes32 public constant OP_COMMAND_DEPOSIT = bytes32("DEPOSIT");
    // forge-lint: disable-next-line(unsafe-typecast)
    bytes32 public constant OP_COMMAND_PLACE_BET = bytes32("PLACE_BET");
    // forge-lint: disable-next-line(unsafe-typecast)
    bytes32 public constant OP_COMMAND_SETTLE = bytes32("SETTLE");
    // forge-lint: disable-next-line(unsafe-typecast)
    bytes32 public constant OP_COMMAND_WITHDRAW = bytes32("WITHDRAW");

    /// @notice Domain-separation prefix the TEE node signs ActionResult hashes under.
    /// Must match go-flare-common's `signing.TEEActionResult` — copied from
    /// fce-weather-insurance's settle()/relayPrivateBuy() verification scheme.
    // forge-lint: disable-next-line(unsafe-typecast)
    bytes32 private constant TEE_ACTION_RESULT_PREFIX = bytes32("TEE_ACTION_RESULT");

    // --- Registries ---

    ITeeExtensionRegistry public immutable TEE_EXTENSION_REGISTRY;
    ITeeMachineRegistry public immutable TEE_MACHINE_REGISTRY;

    /// @notice First public extension ID (registry reserves IDs below this for system use).
    uint256 private constant FIRST_PUBLIC_EXTENSION_ID = 0x10000;

    uint256 private _extensionId;

    // --- Market state ---

    enum MarketType { PRICE, WEATHER }

    struct Market {
        MarketType marketType;
        uint256 startTimestamp;
        uint256 expirationTimestamp;
        bool settled;
        bool outcome;              // PRICE: true = settled price > startPrice ("Up"). WEATHER: true = threshold triggered.
        uint256 referenceValue;    // PRICE: settlement price read from FTSO. WEATHER: measured rain (mm x100).

        // --- PRICE_MARKET fields ---
        bytes21 feedId;
        uint256 startPrice;

        // --- WEATHER_MARKET fields ---
        int256 latitude;
        int256 longitude;
        uint256 rainThresholdMmE2; // payout side triggers iff measured precipitation (mm x100) >= this
    }

    /// @notice ABI payload of a SETTLE instruction — identical shape for both market types,
    /// because by the time it's sent the outcome has already been resolved on-chain (see
    /// requestPriceSettlement / requestWeatherSettlement).
    struct SettleMessage {
        uint256 marketId;
        address contractAddr;
        bool outcome;
        uint256 referenceValue;
    }

    struct DepositMessage {
        address depositor;
        uint256 amount;
    }

    struct PlaceBetMessage {
        address bettor;
        uint256 marketId;
        bytes encryptedBet; // ECIES ciphertext of ABI-encoded (bool isUp, uint256 amount), TEE public key
    }

    Market[] public markets;

    address public owner;
    address public teeAddress;
    IERC20 public payToken;

    event PayTokenSet(address indexed token);
    event TeeAddressSet(address indexed teeAddress);
    event MarketCreated(uint256 indexed marketId, MarketType marketType, uint256 expirationTimestamp);
    event DepositRequested(bytes32 indexed instructionId, address indexed depositor, uint256 amount);
    event BetPlaced(bytes32 indexed instructionId, uint256 indexed marketId, address indexed bettor);
    event SettlementRequested(uint256 indexed marketId, bytes32 instructionId, bool outcome, uint256 referenceValue);
    event MarketSettled(uint256 indexed marketId, bool outcome, uint256 referenceValue);
    event WithdrawRequested(bytes32 indexed instructionId, address indexed requester, uint256 amount, address to);
    event WithdrawalExecuted(bytes32 indexed withdrawalId, address indexed to, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor(ITeeExtensionRegistry _teeExtensionRegistry, ITeeMachineRegistry _teeMachineRegistry) {
        require(address(_teeExtensionRegistry) != address(0), "TeeExtensionRegistry cannot be zero address");
        require(address(_teeMachineRegistry) != address(0), "TeeMachineRegistry cannot be zero address");
        require(address(_teeExtensionRegistry).code.length > 0, "TeeExtensionRegistry has no code");
        require(address(_teeMachineRegistry).code.length > 0, "TeeMachineRegistry has no code");
        TEE_EXTENSION_REGISTRY = _teeExtensionRegistry;
        TEE_MACHINE_REGISTRY = _teeMachineRegistry;
        owner = msg.sender;
    }

    /// @notice Finds and sets this contract's extension id. Can only be set once.
    /// DO NOT MODIFY this function.
    function setExtensionId() external {
        require(_extensionId == 0, "Extension ID already set.");
        uint256 c = TEE_EXTENSION_REGISTRY.nextPublicExtensionId();
        for (uint256 i = FIRST_PUBLIC_EXTENSION_ID; i < c; ++i) {
            if (TEE_EXTENSION_REGISTRY.getTeeExtensionInstructionsSender(i) == address(this)) {
                _extensionId = i;
                return;
            }
        }
        revert("Extension ID not found.");
    }

    function setTeeAddress(address _teeAddress) external onlyOwner {
        require(_teeAddress != address(0), "zero TEE address");
        teeAddress = _teeAddress;
        emit TeeAddressSet(_teeAddress);
    }

    function setPayToken(address _token) external onlyOwner {
        require(_token != address(0), "zero token");
        payToken = IERC20(_token);
        emit PayTokenSet(_token);
    }

    // --- Market creation ---

    /// @notice Create a market. `typeParams` is ABI-encoded per `marketType`:
    ///   PRICE   -> abi.encode(bytes21 feedId)
    ///   WEATHER -> abi.encode(int256 latitude, int256 longitude, uint256 rainThresholdMmE2)
    /// PRICE markets read their starting price from FTSO immediately, directly — no TEE
    /// round trip, since it's a free public view call with no additional trust to gain from
    /// routing it through the TEE. WEATHER markets have no equivalent "start reading": rainfall
    /// is only ever evaluated at settlement.
    function createMarket(
        MarketType marketType,
        bytes calldata typeParams,
        uint256 duration
    ) external returns (uint256 marketId) {
        require(duration > 0, "zero duration");

        Market memory m;
        m.marketType = marketType;
        m.startTimestamp = block.timestamp;
        m.expirationTimestamp = block.timestamp + duration;

        if (marketType == MarketType.PRICE) {
            bytes21 feedId = abi.decode(typeParams, (bytes21));
            /* THIS IS A TEST METHOD, in production use: ContractRegistry.getFtsoV2() */
            TestFtsoV2Interface ftsoV2 = ContractRegistry.getTestFtsoV2();
            (uint256 value,,) = ftsoV2.getFeedById(feedId);
            m.feedId = feedId;
            m.startPrice = value;
        } else {
            (int256 lat, int256 lon, uint256 rainThresholdMmE2) = abi.decode(typeParams, (int256, int256, uint256));
            m.latitude = lat;
            m.longitude = lon;
            m.rainThresholdMmE2 = rainThresholdMmE2;
        }

        marketId = markets.length;
        markets.push(m);
        emit MarketCreated(marketId, marketType, m.expirationTimestamp);
    }

    // --- Deposit (vault, on-chain instruction — fce-orderbook pattern) ---

    function deposit(uint256 amount) external payable {
        require(amount > 0, "zero amount");
        require(address(payToken) != address(0), "payToken not set");
        require(payToken.transferFrom(msg.sender, address(this), amount), "transferFrom failed");

        bytes memory message = abi.encode(DepositMessage({ depositor: msg.sender, amount: amount }));
        bytes32 instructionId = _sendInstruction(OP_COMMAND_DEPOSIT, message, msg.value);
        emit DepositRequested(instructionId, msg.sender, amount);
    }

    // --- Bet placement (on-chain instruction carrying ECIES ciphertext — fce-weather-insurance's
    //     buyPolicyPrivate pattern, not fce-orderbook's off-chain PLACE_ORDER; see contract header) ---

    function placeBet(uint256 marketId, bytes calldata encryptedBet) external payable {
        require(marketId < markets.length, "no such market");
        require(encryptedBet.length > 0, "empty ciphertext");
        Market storage m = markets[marketId];
        require(block.timestamp < m.expirationTimestamp, "market closed");
        require(!m.settled, "already settled");

        bytes memory message = abi.encode(
            PlaceBetMessage({ bettor: msg.sender, marketId: marketId, encryptedBet: encryptedBet })
        );
        bytes32 instructionId = _sendInstruction(OP_COMMAND_PLACE_BET, message, msg.value);
        emit BetPlaced(instructionId, marketId, msg.sender);
    }

    // --- Settlement: outcome resolution is market-type-specific and fully on-chain;
    //     only the payout computation (which needs the encrypted bet ledger) goes to the TEE. ---

    /// @notice Resolve a PRICE market's outcome directly from FTSO and ask the TEE to compute
    /// payouts. No proof needed — FTSO is a public view call.
    function requestPriceSettlement(uint256 marketId) external payable {
        require(marketId < markets.length, "no such market");
        Market storage m = markets[marketId];
        require(m.marketType == MarketType.PRICE, "not a price market");
        require(!m.settled, "already settled");
        require(block.timestamp >= m.expirationTimestamp, "market not expired");

        /* THIS IS A TEST METHOD, in production use: ContractRegistry.getFtsoV2() */
        TestFtsoV2Interface ftsoV2 = ContractRegistry.getTestFtsoV2();
        (uint256 endPrice,,) = ftsoV2.getFeedById(m.feedId);
        bool outcomeUp = endPrice > m.startPrice;

        bytes32 instructionId = _requestSettlement(marketId, outcomeUp, endPrice);
        emit SettlementRequested(marketId, instructionId, outcomeUp, endPrice);
    }

    /// @notice Resolve a WEATHER market's outcome from an FDC Web2Json proof, verified on-chain
    /// (`IFdcVerification.verifyWeb2Json`) — independent of the TEE, matching
    /// flare-foundry-starter's WeatherIdAgency.resolvePolicy() pattern — then ask the TEE to
    /// compute payouts. `proof` must be obtained off-chain first via the standard three-step FDC
    /// flow (prepare request -> submit -> retrieve proof from the DA Layer), same as
    /// flare-foundry-starter's script/WeatherId.s.sol PrepareResolveRequest/SubmitResolveRequest/
    /// ExecuteResolve.
    function requestWeatherSettlement(uint256 marketId, IWeb2Json.Proof calldata proof) external payable {
        require(marketId < markets.length, "no such market");
        Market storage m = markets[marketId];
        require(m.marketType == MarketType.WEATHER, "not a weather market");
        require(!m.settled, "already settled");
        require(block.timestamp >= m.expirationTimestamp, "market not expired");
        require(ContractRegistry.getFdcVerification().verifyWeb2Json(proof), "invalid FDC proof");

        WeatherDataTransportObject memory dto = abi.decode(
            proof.data.responseBody.abiEncodedData,
            (WeatherDataTransportObject)
        );
        require(dto.latitude == m.latitude && dto.longitude == m.longitude, "proof coordinates do not match market");

        bool triggered = dto.rainMmE2 >= m.rainThresholdMmE2;

        bytes32 instructionId = _requestSettlement(marketId, triggered, dto.rainMmE2);
        emit SettlementRequested(marketId, instructionId, triggered, dto.rainMmE2);
    }

    /// @dev Same OP_COMMAND_SETTLE message shape for both market types — see contract header.
    function _requestSettlement(uint256 marketId, bool outcome, uint256 referenceValue) private returns (bytes32) {
        bytes memory message = abi.encode(
            SettleMessage({ marketId: marketId, contractAddr: address(this), outcome: outcome, referenceValue: referenceValue })
        );
        return _sendInstruction(OP_COMMAND_SETTLE, message, msg.value);
    }

    /// @notice ABI-encoded shape expected in the OpenWeatherMap Web2Json `abiSignature` /
    /// postProcessJq output — mirrors flare-foundry-starter's WeatherIdAgency DTO, trimmed to
    /// only the fields this contract checks (coordinates + measured precipitation).
    struct WeatherDataTransportObject {
        int256 latitude;
        int256 longitude;
        uint256 rainMmE2;
    }

    /// @notice Finalize a PRICE market with the TEE-signed payout computation.
    /// @dev Verification scheme matches fce-weather-insurance's settle(): reconstruct
    /// ActionResult.Hash(), wrap with TEE_ACTION_RESULT_PREFIX + chainid, recover signer,
    /// require it equals teeAddress. resultData decodes to (marketId, contractAddr, outcome,
    /// referenceValue) echoed back from the SETTLE instruction — the payout math itself
    /// happened inside the TEE against its private bet ledger and is not re-derivable on-chain.
    function settlePriceMarket(
        bytes calldata resultData,
        bytes32 actionId,
        string calldata submissionTag,
        uint8 status,
        bytes calldata signature
    ) external {
        (uint256 marketId, bool outcome, uint256 referenceValue) =
            _verifyAndDecodeSettleResult(resultData, actionId, submissionTag, status, signature);
        Market storage m = markets[marketId];
        require(m.marketType == MarketType.PRICE, "not a price market");
        _finalizeMarket(marketId, m, outcome, referenceValue);
    }

    /// @notice Finalize a WEATHER market with the TEE-signed payout computation. Kept as a
    /// separate function from settlePriceMarket (not merged despite the identical parameter
    /// shape) so the MarketType <-> function name mapping stays 1:1 for readability, and so the
    /// two can diverge later without a breaking interface change.
    function settleWeatherMarket(
        bytes calldata resultData,
        bytes32 actionId,
        string calldata submissionTag,
        uint8 status,
        bytes calldata signature
    ) external {
        (uint256 marketId, bool outcome, uint256 referenceValue) =
            _verifyAndDecodeSettleResult(resultData, actionId, submissionTag, status, signature);
        Market storage m = markets[marketId];
        require(m.marketType == MarketType.WEATHER, "not a weather market");
        _finalizeMarket(marketId, m, outcome, referenceValue);
    }

    function _verifyAndDecodeSettleResult(
        bytes calldata resultData,
        bytes32 actionId,
        string calldata submissionTag,
        uint8 status,
        bytes calldata signature
    ) private view returns (uint256 marketId, bool outcome, uint256 referenceValue) {
        require(teeAddress != address(0), "TEE address not set");
        require(status == 1, "TEE reported failure");

        bytes32 resultHash = keccak256(
            abi.encodePacked(keccak256(resultData), actionId, keccak256(bytes(submissionTag)), status)
        );
        bytes32 payloadHash = keccak256(abi.encode(TEE_ACTION_RESULT_PREFIX, block.chainid, resultHash));
        address signer = _recoverEthSigned(payloadHash, signature);
        require(signer == teeAddress, "bad TEE signature");

        address contractAddr;
        (marketId, contractAddr, outcome, referenceValue) = abi.decode(resultData, (uint256, address, bool, uint256));
        require(contractAddr == address(this), "settlement not for this contract");
    }

    function _finalizeMarket(uint256 marketId, Market storage m, bool outcome, uint256 referenceValue) private {
        require(!m.settled, "already settled");
        require(block.timestamp >= m.expirationTimestamp, "market not expired");
        m.settled = true;
        m.outcome = outcome;
        m.referenceValue = referenceValue;
        emit MarketSettled(marketId, outcome, referenceValue);
    }

    // --- Withdraw: two-step TEE-authorized withdrawal (fce-orderbook pattern, unchanged
    //     across market types — payouts already live in TEE-held balances after settlement) ---

    /// @notice Request a withdrawal. Sent on-chain so data providers cosign before the TEE acts.
    function withdraw(uint256 amount, address to) external payable {
        require(amount > 0, "zero amount");
        require(to != address(0), "zero address");
        bytes memory message = abi.encode(msg.sender, amount, to);
        bytes32 instructionId = _sendInstruction(OP_COMMAND_WITHDRAW, message, msg.value);
        emit WithdrawRequested(instructionId, msg.sender, amount, to);
    }

    mapping(bytes32 => bool) public usedWithdrawalIds;

    /// @notice Execute a TEE-authorized withdrawal. Anyone can call with valid signed parameters —
    /// copied verbatim (signature scheme included) from fce-orderbook's executeWithdrawal.
    function executeWithdrawal(uint256 amount, address to, bytes32 withdrawalId, bytes calldata signature) external {
        require(teeAddress != address(0), "TEE not configured");
        require(!usedWithdrawalIds[withdrawalId], "withdrawal already executed");

        bytes32 hash = keccak256(abi.encodePacked(amount, to, withdrawalId));
        address signer = _recoverEthSigned(hash, signature);
        require(signer != address(0) && signer == teeAddress, "invalid TEE signature");

        usedWithdrawalIds[withdrawalId] = true;
        require(payToken.transfer(to, amount), "transfer failed");
        emit WithdrawalExecuted(withdrawalId, to, amount);
    }

    // --- Views ---

    function marketCount() external view returns (uint256) {
        return markets.length;
    }

    function getMarket(uint256 marketId) external view returns (Market memory) {
        return markets[marketId];
    }

    // --- Internal ---

    function _getExtensionId() internal view returns (uint256) {
        require(_extensionId != 0, "Extension ID is not set.");
        return _extensionId;
    }

    function _sendInstruction(bytes32 opCommand, bytes memory message, uint256 fee) internal returns (bytes32) {
        address[] memory teeIds = TEE_MACHINE_REGISTRY.getRandomTeeIds(_getExtensionId(), 1);
        address[] memory cosigners = new address[](0);

        ITeeExtensionRegistry.TeeInstructionParams memory params = ITeeExtensionRegistry.TeeInstructionParams({
            opType: OP_TYPE_PREDICTION_MARKET,
            opCommand: opCommand,
            message: message,
            cosigners: cosigners,
            cosignersThreshold: 0,
            claimBackAddress: msg.sender
        });

        return TEE_EXTENSION_REGISTRY.sendInstructions{ value: fee }(teeIds, params);
    }

    /// @notice EIP-191 personal-sign recovery, shared by the settle and withdraw signature checks.
    function _recoverEthSigned(bytes32 hash, bytes calldata signature) private pure returns (address) {
        require(signature.length == 65, "invalid signature length");
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (v < 27) v += 27;
        require(v == 27 || v == 28, "bad signature v");
        return ecrecover(ethHash, v, r, s);
    }
}
