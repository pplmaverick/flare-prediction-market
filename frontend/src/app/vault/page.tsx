"use client";

import { Vault as VaultIcon, LockKey } from "@phosphor-icons/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DepositPanel } from "@/components/deposit-panel";
import { WithdrawPanel } from "@/components/withdraw-panel";
import { useAccount } from "wagmi";

export default function VaultPage() {
  const { isConnected } = useAccount();

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
