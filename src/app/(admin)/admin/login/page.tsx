import { Suspense } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { LoginForm } from "@/components/admin/login-form";
import { hasSupabaseService, inspectEnvironment } from "@/lib/config";

export const dynamic = "force-dynamic";


export default function AdminLoginPage() {
  // Configuration problems are reported here, in the deployment, instead of
  // leaving the visitor with a bare "Unauthorized" from Supabase.
  const issues = inspectEnvironment();
  const fatal = issues.filter((issue) => issue.level === "fatal");

  return (
    <div className="grid min-h-dvh place-items-center px-5 py-16">
      <div className="w-full max-w-md">
        {!hasSupabaseService || fatal.length ? (
          <div className="mb-6 border border-alert/40 bg-alert/5 px-4 py-4 text-sm">
            <p className="flex items-center gap-2 font-medium text-alert">
              <AlertTriangle size={15} aria-hidden="true" />
              The backend is not fully configured on this deployment
            </p>
            <ul className="mt-3 flex flex-col gap-2 text-bone-dim">
              {issues.map((issue) => (
                <li key={issue.variable + issue.message} className="flex gap-2">
                  <span className="font-mono text-[0.625rem] tracking-[0.1em] text-bone-faint uppercase">
                    {issue.variable}
                  </span>
                  <span>{issue.message}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t border-edge pt-3 text-xs text-bone-faint">
              Configure these in the hosting environment (Amplify → App settings →
              Environment variables), then redeploy. Sign-in cannot work until they are
              correct.
            </p>
          </div>
        ) : issues.length ? (
          <div className="mb-6 border border-edge px-4 py-3 text-xs text-bone-faint">
            <p className="flex items-center gap-2">
              <Info size={13} aria-hidden="true" /> Configuration notes
            </p>
            <ul className="mt-2 flex flex-col gap-1">
              {issues.map((issue) => (
                <li key={issue.variable + issue.message}>
                  <span className="font-mono">{issue.variable}</span> {issue.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <Suspense fallback={<div className="admin-panel h-72" />}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
