"use client";

import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { defineChain } from "viem";
import { useState, type ReactNode } from "react";
import "@rainbow-me/rainbowkit/styles.css";

/**
 * Wallet code is only mounted on /mint and only when a WalletConnect project id
 * is configured. The rest of the site ships no wallet bundle at all — that keeps
 * first paint fast for a gallery that is mostly images.
 *
 * wagmi is pinned to 2.x because RainbowKit 2.2 does not support wagmi 3.
 */
const apeChain = defineChain({
  id: 33139,
  name: "ApeChain",
  nativeCurrency: { name: "ApeCoin", symbol: "APE", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_APECHAIN_RPC_URL ?? "https://rpc.apechain.com/http"] },
  },
  blockExplorers: {
    default: { name: "ApeScan", url: "https://apescan.io" },
  },
  testnet: false,
});

let cachedConfig: ReturnType<typeof createConfig> | null = null;

function config() {
  cachedConfig ??= createConfig({
    chains: [apeChain],
    transports: { [apeChain.id]: http() },
    ssr: true,
    multiInjectedProviderDiscovery: true,
  });
  return cachedConfig;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config()}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          modalSize="compact"
          theme={darkTheme({
            accentColor: "#8fd6c1",
            accentColorForeground: "#08090a",
            borderRadius: "none",
            overlayBlur: "small",
            fontStack: "system",
          })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
