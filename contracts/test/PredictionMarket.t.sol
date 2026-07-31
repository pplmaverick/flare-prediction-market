// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { Test } from "forge-std/Test.sol";
import { PredictionMarket } from "../src/PredictionMarket.sol";
import { ITeeExtensionRegistry } from "../interfaces/ITeeExtensionRegistry.sol";
import { ITeeMachineRegistry } from "../interfaces/ITeeMachineRegistry.sol";
import { ContractRegistry } from "flare-periphery/src/coston2/ContractRegistry.sol";

/// @notice Minimal ERC-20 mock used as PredictionMarket's payToken. Implements the same
/// transfer/transferFrom selectors PredictionMarket calls, plus mint/approve/balanceOf so tests
/// can set up and assert on balances directly.
contract MockERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "insufficient allowance");
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        require(balanceOf[from] >= amount, "insufficient balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

/// @notice Mock ITeeExtensionRegistry. Only `getTeeExtensionInstructionsSender` needs real
/// behavior (PredictionMarket.setExtensionId() scans it at 0x10000, the first public extension
/// id per PredictionMarket's FIRST_PUBLIC_EXTENSION_ID); `sendInstructions` just returns a fixed
/// instruction id so tests can assert exact event args.
contract MockTeeExtensionRegistry is ITeeExtensionRegistry {
    uint256 private constant FIRST_PUBLIC_EXTENSION_ID = 0x10000;
    bytes32 private constant MOCK_INSTRUCTION_ID = bytes32("mock-instruction");

    address private _sender;

    function setSender(address sender_) external {
        _sender = sender_;
    }

    function sendInstructions(
        address[] calldata,
        TeeInstructionParams calldata
    ) external payable returns (bytes32) {
        return MOCK_INSTRUCTION_ID;
    }

    function nextPublicExtensionId() external pure returns (uint256) {
        return FIRST_PUBLIC_EXTENSION_ID + 1;
    }

    function getTeeExtensionInstructionsSender(uint256 extensionId) external view returns (address) {
        return extensionId == FIRST_PUBLIC_EXTENSION_ID ? _sender : address(0);
    }
}

/// @notice Mock ITeeMachineRegistry — only used to satisfy PredictionMarket's constructor
/// (non-zero address with code) and _sendInstruction's getRandomTeeIds call.
contract MockTeeMachineRegistry is ITeeMachineRegistry {
    function getRandomTeeIds(uint256, uint256 count) external pure returns (address[] memory ids) {
        ids = new address[](count);
        for (uint256 i = 0; i < count; i++) {
            ids[i] = address(uint160(0x1234 + i));
        }
    }
}

/// @notice Stand-in for the real IFlareContractRegistry deployed at
/// ContractRegistry.FLARE_CONTRACT_REGISTRY_ADDRESS on Flare chains. Test installs this at that
/// fixed address via vm.etch so ContractRegistry.getTestFtsoV2() resolves to our MockFtsoV2
/// instead of reverting (no code at that address on a plain anvil chain).
contract MockFlareContractRegistry {
    mapping(bytes32 => address) public addressByHash;

    function setAddressByHash(bytes32 nameHash, address addr) external {
        addressByHash[nameHash] = addr;
    }

    function getContractAddressByHash(bytes32 nameHash) external view returns (address) {
        return addressByHash[nameHash];
    }
}

/// @notice Mock FTSOv2 feed reader. Only implements getFeedById (bytes21) — the sole
/// TestFtsoV2Interface function PredictionMarket actually calls.
contract MockFtsoV2 {
    uint256 private _price = 1000e8;
    int8 private constant DECIMALS = 8;
    uint64 private constant TIMESTAMP = 1_700_000_000;

    function setPrice(uint256 price_) external {
        _price = price_;
    }

    function getFeedById(bytes21) external view returns (uint256, int8, uint64) {
        return (_price, DECIMALS, TIMESTAMP);
    }
}

contract PredictionMarketTest is Test {
    PredictionMarket internal pm;
    MockERC20 internal payToken;
    MockTeeExtensionRegistry internal teeExtensionRegistry;
    MockTeeMachineRegistry internal teeMachineRegistry;
    MockFtsoV2 internal mockFtso;

    bytes21 internal constant FEED_ID = bytes21("BTC/USD");

    function setUp() public {
        teeMachineRegistry = new MockTeeMachineRegistry();
        teeExtensionRegistry = new MockTeeExtensionRegistry();

        pm = new PredictionMarket(
            ITeeExtensionRegistry(address(teeExtensionRegistry)),
            ITeeMachineRegistry(address(teeMachineRegistry))
        );

        // Register `pm` as the sender for extension id 0x10000, then let it self-discover that
        // id — mirrors the real registry-wiring flow setExtensionId() expects.
        teeExtensionRegistry.setSender(address(pm));
        pm.setExtensionId();

        payToken = new MockERC20();
        pm.setPayToken(address(payToken));

        // Wire ContractRegistry's hardcoded FlareContractRegistry address to our mock so
        // createMarket()/requestPriceSettlement() can read a deterministic FTSO price without
        // forking a live Flare chain.
        mockFtso = new MockFtsoV2();
        MockFlareContractRegistry registryImpl = new MockFlareContractRegistry();
        vm.etch(ContractRegistry.FLARE_CONTRACT_REGISTRY_ADDRESS, address(registryImpl).code);
        MockFlareContractRegistry(ContractRegistry.FLARE_CONTRACT_REGISTRY_ADDRESS)
            .setAddressByHash(keccak256(abi.encode("FtsoV2")), address(mockFtso));
    }

    /// @notice deposit() escrows `amount` of payToken into the contract and emits
    /// DepositRequested with the exact (instructionId, depositor, amount) tuple.
    function test_deposit() public {
        address user = makeAddr("user");
        uint256 amount = 100e18;
        payToken.mint(user, amount);

        vm.startPrank(user);
        payToken.approve(address(pm), amount);

        vm.expectEmit(true, true, false, true, address(pm));
        emit PredictionMarket.DepositRequested(bytes32("mock-instruction"), user, amount);
        pm.deposit(amount);
        vm.stopPrank();

        assertEq(payToken.balanceOf(address(pm)), amount, "contract did not receive escrowed amount");
        assertEq(payToken.balanceOf(user), 0, "user balance should be fully debited");
    }

    /// @notice createMarket() for a PRICE market stores feedId/expiration/settled correctly and
    /// reads the start price from FTSO at creation time.
    function test_createMarket() public {
        uint256 duration = 1 days;
        mockFtso.setPrice(65_000e8);

        uint256 marketId = pm.createMarket(PredictionMarket.MarketType.PRICE, abi.encode(FEED_ID), duration);
        assertEq(marketId, 0, "first market should be id 0");

        PredictionMarket.Market memory m = pm.getMarket(marketId);
        assertTrue(m.feedId == FEED_ID, "feedId mismatch");
        assertFalse(m.settled, "new market should not be settled");
        assertEq(m.startPrice, 65_000e8, "startPrice should be read from FTSO at creation");
        assertEq(m.expirationTimestamp, block.timestamp + duration, "expirationTimestamp mismatch");
    }

    /// @notice requestPriceSettlement() must revert while the market hasn't reached its
    /// expirationTimestamp yet.
    function test_requestSettlement_notExpired() public {
        uint256 marketId = pm.createMarket(PredictionMarket.MarketType.PRICE, abi.encode(FEED_ID), 1 days);

        vm.expectRevert("market not expired");
        pm.requestPriceSettlement(marketId);
    }

    /// @notice createMarket() rejects a zero duration outright (checked before any FTSO read).
    /// Substituted for the originally-requested "duplicate marketId" case, which isn't reachable:
    /// marketId is always auto-assigned as markets.length, so there is no user-supplied id to
    /// collide on.
    function test_createMarket_zeroDuration() public {
        vm.expectRevert("zero duration");
        pm.createMarket(PredictionMarket.MarketType.PRICE, abi.encode(FEED_ID), 0);
    }
}
