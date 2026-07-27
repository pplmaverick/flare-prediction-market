"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useReadContract } from "wagmi";
import {
  predictionMarketContract,
  erc20Abi,
  FLARE_CONTRACT_REGISTRY_ADDRESS,
  flareContractRegistryAbi,
  testFtsoV2Abi,
} from "./contract";
import { fetchBetCountForMarket } from "./blockscout";
import type { Address, Hex } from "viem";

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function useMarketCount() {
  return useReadContract({
    ...predictionMarketContract,
    functionName: "marketCount",
  });
}

export function useMarket(marketId: number) {
  return useReadContract({
    ...predictionMarketContract,
    functionName: "getMarket",
    args: [BigInt(marketId)],
  });
}

/** Number of encrypted bets placed on a market — public (an on-chain event
 * exists per bet), unlike the bet's side/amount which stay TEE-private.
 * Sourced from Blockscout's API since Coston2's public RPC rejects
 * address-filtered eth_getLogs (see lib/blockscout.ts). */
export function useBetCount(marketId: number) {
  return useQuery({
    queryKey: ["bet-count", marketId],
    queryFn: () => fetchBetCountForMarket(marketId),
    staleTime: 30_000,
  });
}

export function useTeeAddress() {
  return useReadContract({
    ...predictionMarketContract,
    functionName: "teeAddress",
  });
}

export function usePayTokenAddress() {
  return useReadContract({
    ...predictionMarketContract,
    functionName: "payToken",
  });
}

export function useErc20Meta(token: Address | undefined) {
  const enabled = !!token && token !== "0x0000000000000000000000000000000000000000";
  const decimals = useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "decimals",
    query: { enabled },
  });
  const symbol = useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "symbol",
    query: { enabled },
  });
  return { decimals: decimals.data, symbol: symbol.data, isLoading: decimals.isLoading || symbol.isLoading };
}

export function useErc20Balance(token: Address | undefined, account: Address | undefined) {
  const enabled =
    !!token && !!account && token !== "0x0000000000000000000000000000000000000000";
  return useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: account ? [account] : undefined,
    query: { enabled },
  });
}

export function useFtsoV2Address() {
  return useReadContract({
    address: FLARE_CONTRACT_REGISTRY_ADDRESS,
    abi: flareContractRegistryAbi,
    functionName: "getContractAddressByName",
    args: ["FtsoV2"],
  });
}

/** Live FTSO reading for a feed — used to get decimals for scaling the
 * market's stored startPrice/referenceValue (not stored on-chain, see
 * PredictionMarket.sol's createMarket) and to show the current price. */
export function useFeedPrice(feedId: Hex | undefined) {
  const { data: ftsoV2Address } = useFtsoV2Address();
  return useReadContract({
    address: ftsoV2Address,
    abi: testFtsoV2Abi,
    functionName: "getFeedById",
    args: feedId ? [feedId] : undefined,
    query: { enabled: !!ftsoV2Address && !!feedId },
  });
}

export function useErc20Allowance(
  token: Address | undefined,
  owner: Address | undefined,
  spender: Address
) {
  const enabled =
    !!token && !!owner && token !== "0x0000000000000000000000000000000000000000";
  return useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: owner ? [owner, spender] : undefined,
    query: { enabled },
  });
}
