"use client";

import { useState } from "react";
import { Check, Link2, Unplug } from "lucide-react";
import { normalizeEvmAddress } from "@/lib/validation";

export type WalletSource = "manual" | "walletconnect" | "injected";

export type WalletFieldProps = {
  value: string;
  onChange: (value: string, source: WalletSource) => void;
  error?: string | null;
  disabled?: boolean;
  /** True when a wallet is connected and filled the field. */
  connected?: boolean;
  /** Clears the field and disconnects, when a wallet is connected. */
  onDisconnect?: () => void;
  /** Rendered next to the label: the ConnectButton, only when wagmi is mounted. */
  connectSlot?: React.ReactNode;
};

/**
 * Wallet address field.
 *
 * This component deliberately contains **no wagmi hooks**. It is rendered both
 * with and without a wallet provider, and calling `useAccount` outside
 * `WagmiProvider` throws `WagmiProviderNotFoundError` — which took down the whole
 * `/mint` page on a deployment where the wallet was not configured. Anything that
 * needs wagmi lives in `wallet-field-connected.tsx`, which is only ever mounted
 * inside the provider.
 */
export function WalletField({
  value,
  onChange,
  error,
  disabled,
  connected = false,
  onDisconnect,
  connectSlot,
}: WalletFieldProps) {
  const [localError, setLocalError] = useState<string | null>(null);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="label mb-0" htmlFor="wallet">
          Wallet address (EVM, ApeChain compatible)
        </label>
        <div className="flex items-center gap-2">
          {connected && onDisconnect ? (
            <button
              type="button"
              onClick={() => {
                setLocalError(null);
                onDisconnect();
              }}
              className="chip transition-colors hover:border-bone hover:text-bone"
            >
              <Unplug size={11} aria-hidden="true" /> Disconnect
            </button>
          ) : (
            connectSlot
          )}
        </div>
      </div>

      <input
        id="wallet"
        name="wallet"
        type="text"
        value={value}
        disabled={disabled}
        onChange={(event) => {
          setLocalError(null);
          onChange(event.target.value, "manual");
        }}
        onBlur={() => {
          if (!value.trim()) {
            setLocalError(null);
            return;
          }
          const parsed = normalizeEvmAddress(value);
          setLocalError(parsed.ok ? null : parsed.error);
        }}
        placeholder="0x… (optional — you can paste it)"
        autoComplete="off"
        spellCheck={false}
        inputMode="text"
        className="field mt-3 font-mono text-sm"
        aria-invalid={Boolean(error || localError)}
        aria-describedby="wallet-help"
      />

      <p id="wallet-help" className="mt-2 text-xs leading-relaxed text-bone-faint">
        {connected ? (
          <span className="inline-flex items-center gap-1.5 text-accent">
            <Check size={11} aria-hidden="true" /> Filled from your connected wallet.
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <Link2 size={11} aria-hidden="true" /> Optional. Paste it manually or connect a wallet.
          </span>
        )}{" "}
        Connecting or typing an address does not prove you own it, and nothing is signed here.
      </p>

      {localError || error ? (
        <p role="alert" className="mt-2 text-xs text-alert">
          {localError ?? error}
        </p>
      ) : null}
    </div>
  );
}
