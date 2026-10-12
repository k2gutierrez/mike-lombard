"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, Check, Info, Loader2, ShieldCheck } from "lucide-react";
import { WalletField } from "@/components/mint/wallet-field";
import { walletConnectProjectId } from "@/lib/config";
import { normalizeEmail, validateEmail } from "@/lib/validation";
import type { SiteContent } from "@/lib/types";

/**
 * Wallet chrome is loaded lazily and only when a WalletConnect project id
 * exists. `ssr: false` keeps wagmi/RainbowKit out of the server bundle.
 */
const WalletProvider = dynamic(
  () => import("@/components/mint/wallet-provider").then((mod) => mod.WalletProvider),
  { ssr: false },
);

const WalletFieldLazy = dynamic(
  () => import("@/components/mint/wallet-field").then((mod) => mod.WalletField),
  { ssr: false },
);

type Status =
  | { state: "idle" }
  | { state: "sending" }
  | { state: "done"; message: string; duplicate: boolean }
  | { state: "error"; message: string; field?: string };

export function MintForm({ mint }: { mint: SiteContent["mint"] }) {
  const [email, setEmail] = useState("");
  const [wallet, setWallet] = useState("");
  const [walletSource, setWalletSource] = useState<"manual" | "walletconnect" | "injected">("manual");
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [touched, setTouched] = useState(false);
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const startedAt = useRef<number>(Date.now());

  const emailError = useMemo(() => (touched ? validateEmail(email) : null), [email, touched]);

  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  const walletEnabled = Boolean(walletConnectProjectId);

  const content = (
    <form
      noValidate
      onSubmit={async (event) => {
        event.preventDefault();
        setTouched(true);

        const emailProblem = validateEmail(email);
        if (emailProblem) {
          setStatus({ state: "error", message: emailProblem, field: "email" });
          return;
        }
        if (!consent) {
          setStatus({
            state: "error",
            message: "Please confirm you agree to receive information about this mint.",
            field: "consent",
          });
          return;
        }

        setStatus({ state: "sending" });
        try {
          const response = await fetch("/api/mint", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              email: normalizeEmail(email),
              walletAddress: wallet.trim() || null,
              walletSource: wallet.trim() ? walletSource : null,
              consent: true,
              consentText: mint.consentText,
              honeypot,
              elapsedMs: Date.now() - startedAt.current,
              source: "mint-page",
              referrer: document.referrer || null,
              locale: navigator.language,
            }),
          });

          const payload = (await response.json()) as {
            ok?: boolean;
            error?: string;
            field?: string;
            message?: string;
            duplicate?: boolean;
          };

          if (!response.ok || !payload.ok) {
            setStatus({
              state: "error",
              message: payload.error ?? "Something failed. Please try again.",
              field: payload.field,
            });
            return;
          }

          setStatus({
            state: "done",
            message: payload.message ?? "You are on the list.",
            duplicate: Boolean(payload.duplicate),
          });
        } catch {
          setStatus({
            state: "error",
            message: "We could not reach the server. Check your connection and try again.",
          });
        }
      }}
      className="border border-edge bg-pit/60 p-6 sm:p-9"
    >
      {!mint.open ? (
        <p className="mb-8 flex items-start gap-3 border border-edge px-4 py-3 text-sm text-bone-dim">
          <Info size={15} className="mt-0.5 shrink-0 text-bone-faint" aria-hidden="true" />
          {mint.closedMessage}
        </p>
      ) : null}

      {status.state === "done" ? (
        <div className="flex flex-col items-start gap-5">
          <span className="grid size-11 place-items-center border border-accent text-accent">
            <Check size={18} aria-hidden="true" />
          </span>
          <div>
            <p className="font-display text-2xl tracking-tight">
              {status.duplicate ? "Already registered" : "Registration received"}
            </p>
            <p className="mt-3 max-w-md text-sm text-bone-dim">{status.message}</p>
          </div>
          <p className="max-w-md border-t border-edge pt-5 font-mono text-[0.625rem] leading-relaxed tracking-wide text-bone-faint uppercase">
            {mint.disclaimer}
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-7">
            <div>
              <label className="label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                onBlur={() => setTouched(true)}
                autoComplete="email"
                placeholder="you@example.com"
                className="field"
                aria-invalid={Boolean(emailError)}
                aria-describedby="email-help"
              />
              <p id="email-help" className="mt-2 text-xs text-bone-faint">
                Only used to send you information about this mint.
              </p>
              {emailError ? (
                <p role="alert" className="mt-2 text-xs text-alert">
                  {emailError}
                </p>
              ) : null}
            </div>

            {walletEnabled ? (
              <WalletFieldLazy
                value={wallet}
                onChange={(next, source) => {
                  setWallet(next);
                  setWalletSource(source);
                }}
                error={
                  status.state === "error" && status.field === "wallet" ? status.message : undefined
                }
              />
            ) : (
              <WalletField
                value={wallet}
                onChange={(next, source) => {
                  setWallet(next);
                  setWalletSource(source);
                }}
                error={
                  status.state === "error" && status.field === "wallet" ? status.message : undefined
                }
              />
            )}

            {/* Honeypot: hidden from humans, irresistible to naive bots. */}
            <div aria-hidden="true" className="absolute h-0 w-0 overflow-hidden opacity-0">
              <label htmlFor="company-website">Company website</label>
              <input
                id="company-website"
                name="company-website"
                tabIndex={-1}
                autoComplete="off"
                value={honeypot}
                onChange={(event) => setHoneypot(event.target.value)}
              />
            </div>

            <div>
              <label className="flex cursor-pointer items-start gap-3 text-sm text-bone-dim">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                  className="mt-0.5 size-4 shrink-0 appearance-none border border-edge-soft bg-void checked:border-accent checked:bg-accent"
                  aria-describedby="consent-help"
                />
                <span>{mint.consentText}</span>
              </label>
              <p id="consent-help" className="mt-2 pl-7 text-xs text-bone-faint">
                You can ask us to remove your data at any time. Consent is stored with its date.
              </p>
              {status.state === "error" && status.field === "consent" ? (
                <p role="alert" className="mt-2 pl-7 text-xs text-alert">
                  {status.message}
                </p>
              ) : null}
            </div>
          </div>

          {status.state === "error" && !status.field ? (
            <p
              role="alert"
              className="mt-7 flex items-start gap-3 border border-alert/40 px-4 py-3 text-sm text-alert"
            >
              <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
              {status.message}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={status.state === "sending" || !mint.open}
            className="btn btn-primary mt-8 w-full"
          >
            {status.state === "sending" ? (
              <>
                <Loader2 size={14} className="animate-spin" aria-hidden="true" /> Sending
              </>
            ) : (
              <>
                Register interest <ArrowRight size={14} aria-hidden="true" />
              </>
            )}
          </button>

          <p className="mt-5 flex items-start gap-2.5 text-xs leading-relaxed text-bone-faint">
            <ShieldCheck size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
            Validated on the server, rate limited, and protected against duplicate
            registrations. This form never asks for a payment, a token approval or a
            transaction.
          </p>
        </>
      )}
    </form>
  );

  return walletEnabled ? <WalletProvider>{content}</WalletProvider> : content;
}
