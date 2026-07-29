"use client";

import { Vault as VaultIcon, LockKey } from "@phosphor-icons/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DepositPanel } from "@/components/deposit-panel";
import { WithdrawPanel } from "@/components/withdraw-panel";
import { useAccount } from "wagmi";
import { usePayTokenAddress, useErc20Meta, useVaultBalance } from "@/lib/hooks";
import { formatTokenAmount } from "@/lib/format";

export default function VaultPage() {
  const { address, isConnected } = useAccount();
  const { data: payToken } = usePayTokenAddress();
  const { decimals, symbol } = useErc20Meta(payToken);
  const { data: vaultBalance, isLoading: isBalanceLoading } = useVaultBalance(address);

  const balanceReady = !isBalanceLoading && vaultBalance !== undefined && decimals !== undefined;
  const estimatedBalance =
    balanceReady && vaultBalance
      ? vaultBalance.deposited - vaultBalance.withdrawn > 0n
        ? vaultBalance.deposited - vaultBalance.withdrawn
        : 0n
      : undefined;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-raised text-primary">
          <VaultIcon size={22} weight="bold" />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Vault</h1>
          <p className="text-sm text-muted-foreground">Deposit collateral, withdraw settled winnings</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Manage Balance</CardTitle>
            <Badge variant="confidential">
              <LockKey size={12} weight="bold" />
              Balance held privately by TEE
            </Badge>
          </div>
          <CardDescription>
            This contract only custodies the pooled token total. Your individual
            available/locked balance lives entirely in TEE memory, never on-chain.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!isConnected ? (
            <p className="text-sm text-muted-foreground">Connect your wallet to continue.</p>
          ) : (
            <Tabs defaultValue="deposit">
              <div className="mb-5 text-sm">
                {estimatedBalance !== undefined ? (
                  <>
                    <p className="text-foreground">
                      Estimated balance: {formatTokenAmount(estimatedBalance, decimals ?? 18)} {symbol ?? ""}
                    </p>
                    <p className="text-xs text-muted-foreground">(actual may differ due to active bets)</p>
                  </>
                ) : (
                  <p className="text-muted-foreground">Loading balance...</p>
                )}
              </div>
              <TabsList className="mb-5">
                <TabsTrigger value="deposit">Deposit</TabsTrigger>
                <TabsTrigger value="withdraw">Withdraw</TabsTrigger>
              </TabsList>
              <TabsContent value="deposit">
                <DepositPanel />
              </TabsContent>
              <TabsContent value="withdraw">
                <WithdrawPanel />
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
