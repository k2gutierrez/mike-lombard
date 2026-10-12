"use client";

import { useEffect, useRef } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useDisconnect } from "wagmi";
import { WalletField, type WalletSource } from "@/components/mint/wallet-field";
import { normalizeEvmAddress } from "@/lib/validation";

/**
 * Wallet field with the wallet connection wired in.
 *
 * Mount this **only** inside `WalletProvider`. It is the only place that touches
 * wagmi, and it is loaded with `ssr: false`, so the provider is guaranteed to be
 * an ancestor by the time it renders. Keep `wallet-field.tsx` hook-free so the
 * same field can be rendered without any wallet code at all.
 */
export function WalletFieldConnected({
  value,
  onChange,
  error,
  disabled,
}: {
  value: string;
  onChange: (value: string, source: WalletSource) => void;
  error?: string | null;
  disabled?: boolean;
}) {
  const { address, isConnected, connector } = useAccount();
  const { disconnect } = useDisconnect();
  const lastFilled = useRef<string | null>(null);

  useEffect(() => {
    if (!isConnected || !address) return;
    if (lastFilled.current === address) return;
    const parsed = normalizeEvmAddress(address);
    if (!parsed.ok) return;
    lastFilled.current = address;
    onChange(parsed.address, connector?.id === "walletConnect" ? "walletconnect" : "injected");
  }, [address, isConnected, connector?.id, onChange]);

  return (
    <WalletField
      value={value}
      onChange={onChange}
      error={error}
      disabled={disabled}
      connected={isConnected}
      onDisconnect={() => {
        lastFilled.current = null;
        disconnect();
        onChange("", "manual");
      }}
      connectSlot={
        <div className="[&_button]:border [&_button]:border-edge-soft [&_button]:bg-transparent [&_button]:font-mono [&_button]:text-[0.625rem] [&_button]:tracking-[0.14em] [&_button]:uppercase [&_button]:text-bone">
          <ConnectButton chainStatus="none" showBalance={false} accountStatus="address" />
        </div>
      }
    />
  );
}
