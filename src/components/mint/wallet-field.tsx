"use client";

import { useEffect, useRef, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useDisconnect } from "wagmi";
import { Check, Link2, Unplug } from "lucide-react";
import { normalizeEvmAddress } from "@/lib/validation";

/**
 * Optional wallet connection.
 *
 * Connecting (or typing) an address proves nothing about ownership — it is only
 * a convenience fill for the field. The copy says so, and no signature is
 * requested anywhere in this project.
 */
export function WalletField({
  value,
  onChange,
  error,
  disabled,
}: {
  value: string;
  onChange: (value: string, source: "manual" | "walletconnect" | "injected") => void;
  error?: string | null;
  disabled?: boolean;
}) {
  const { address, isConnected, connector } = useAccount();
  const { disconnect } = useDisconnect();
  const lastFilled = useRef<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!isConnected || !address) return;
    if (lastFilled.current === address) return;
    const parsed = normalizeEvmAddress(address);
    if (!parsed.ok) return;
    lastFilled.current = address;
    onChange(parsed.address, connector?.id === "walletConnect" ? "walletconnect" : "injected");
  }, [address, isConnected, connector?.id, onChange]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="label mb-0" htmlFor="wallet">
          Wallet address (EVM, ApeChain compatible)
        </label>
        <div className="flex items-center gap-2">
          {isConnected ? (
            <button
              type="button"
              onClick={() => {
                lastFilled.current = null;
                disconnect();
                onChange("", "manual");
              }}
              className="chip transition-colors hover:border-bone hover:text-bone"
            >
              <Unplug size={11} aria-hidden="true" /> Disconnect
            </button>
          ) : (
            <div className="[&_button]:border [&_button]:border-edge-soft [&_button]:bg-transparent [&_button]:font-mono [&_button]:text-[0.625rem] [&_button]:tracking-[0.14em] [&_button]:uppercase [&_button]:text-bone">
              <ConnectButton chainStatus="none" showBalance={false} accountStatus="address" />
            </div>
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
        {isConnected ? (
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
