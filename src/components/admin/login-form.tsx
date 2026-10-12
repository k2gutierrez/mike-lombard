"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, LogIn, Mail } from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const expired = params.get("error") === "expired";
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setState("sending");
        setMessage("");
        try {
          const response = await fetch("/api/admin/login", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email }),
          });
          const payload = (await response.json()) as {
            ok?: boolean;
            url?: string;
            mode?: string;
            message?: string;
            error?: string;
          };

          if (!response.ok || !payload.ok) {
            setState("error");
            setMessage(payload.error ?? "Sign-in failed.");
            return;
          }

          if (payload.mode === "handoff" && payload.url) {
            // One-time token, consumed immediately by /auth/callback.
            router.push(payload.url);
            return;
          }

          setState("done");
          setMessage(payload.message ?? "Check your inbox.");
        } catch {
          setState("error");
          setMessage("We could not reach the server.");
        }
      }}
      className="admin-panel w-full max-w-md p-7 sm:p-9"
    >
      <p className="eyebrow">Restricted</p>
      <h1 className="mt-4 font-display text-3xl tracking-tight">Admin sign-in</h1>
      <p className="mt-3 text-sm text-bone-dim">
        Only administrator accounts can open the panel. The email is checked on the
        server before any link is generated.
      </p>

      {expired ? (
        <p role="alert" className="mt-6 border border-alert/40 px-4 py-3 text-sm text-alert">
          That link expired or was already used. Request a new one.
        </p>
      ) : null}

      <div className="mt-8">
        <label className="label" htmlFor="admin-email">
          Email
        </label>
        <input
          id="admin-email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          placeholder="you@studio.com"
          className="field"
        />
      </div>

      {message ? (
        <p
          role={state === "error" ? "alert" : "status"}
          className={`mt-5 text-sm ${state === "error" ? "text-alert" : "text-bone-dim"}`}
        >
          {message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={state === "sending"}
        className="btn btn-primary mt-8 w-full"
      >
        {state === "sending" ? (
          <>
            <Loader2 size={14} className="animate-spin" aria-hidden="true" /> Checking
          </>
        ) : (
          <>
            <LogIn size={14} aria-hidden="true" /> Continue
          </>
        )}
      </button>

      <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-bone-faint">
        <Mail size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
        If custom SMTP is configured, a magic link arrives by email. Otherwise the panel
        signs you in directly with a one-time token.
      </p>
    </form>
  );
}
