// Selectors for custom errors declared on Flare's shared TeeExtensionRegistry
// (not in our own ABI, so viem can't auto-decode them) — see root README's
// "Implementation Notes": `deposit()`/`placeBet()`/settlement calls forward
// `msg.value` as the TEE registry fee and revert `FeeTooLow` if it's 0 or
// below the registry's minimum.
const KNOWN_SELECTORS: Record<string, string> = {
  "0x732f9413": "Network fee too low for the TEE registry. Increase the fee and try again.",
};

export function getFriendlyErrorMessage(error: unknown): string {
  const err = error as { shortMessage?: string; message?: string; details?: string; data?: unknown } | undefined;
  const raw = [err?.shortMessage, err?.message, err?.details].filter(Boolean).join(" ");

  for (const [selector, message] of Object.entries(KNOWN_SELECTORS)) {
    if (raw.includes(selector)) return message;
  }

  if (raw.toLowerCase().includes("user rejected")) return "Transaction rejected in wallet.";
  if (raw.toLowerCase().includes("insufficient funds")) return "Insufficient balance to cover amount + gas.";

  return err?.shortMessage ?? err?.message ?? "Transaction failed. See console for details.";
}
