import type { Address } from "viem";
import { predictionMarketAbi } from "./prediction-market-abi";

// Coston2 deployment address, see root README.md "Deployed Contracts".
// Overridable via env for redeploys without touching code.
export const PREDICTION_MARKET_ADDRESS = (process.env
  .NEXT_PUBLIC_PREDICTION_MARKET_ADDRESS ??
  "0x9C22c9F1954f2E1D7B305c0E2932edEBE713bDc3") as Address;

export const predictionMarketContract = {
  address: PREDICTION_MARKET_ADDRESS,
  abi: predictionMarketAbi,
} as const;

export const MarketType = {
  PRICE: 0,
  WEATHER: 1,
} as const;

// Minimal ERC-20 surface for the pooled stake token. The contract only
// exposes `payToken()` (address); decimals/symbol/allowance/balanceOf are
// read directly against whatever token that resolves to.
// Flare's canonical contract registry (same address across Flare/Coston2/
// Songbird/Coston — see flare-periphery's ContractRegistry.sol). Used only
// to resolve the live FtsoV2 address for read-only price display; the
// contract itself resolves this on-chain via ContractRegistry.getTestFtsoV2().
export const FLARE_CONTRACT_REGISTRY_ADDRESS =
  "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019" as Address;

export const flareContractRegistryAbi = [
  {
    type: "function",
    name: "getContractAddressByName",
    stateMutability: "view",
    inputs: [{ name: "_name", type: "string" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

export const testFtsoV2Abi = [
  {
    type: "function",
    name: "getFeedById",
    stateMutability: "view",
    inputs: [{ name: "_feedId", type: "bytes21" }],
    outputs: [
      { name: "_value", type: "uint256" },
      { name: "_decimals", type: "int8" },
      { name: "_timestamp", type: "uint64" },
    ],
  },
] as const;

export const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
] as const;
