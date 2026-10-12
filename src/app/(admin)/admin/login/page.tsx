import { Suspense } from "react";
import { LoginForm } from "@/components/admin/login-form";
import { hasSupabaseService } from "@/lib/config";

export const dynamic = "force-dynamic";

export default function AdminLoginPage() {
  return (
    <div className="grid min-h-dvh place-items-center px-5 py-16">
      <div className="w-full max-w-md">
        {!hasSupabaseService ? (
          <p className="mb-6 border border-alert/40 px-4 py-3 text-sm text-alert">
            Supabase is not configured on this environment. Add the project URL and the
            service-role key to <code className="font-mono">.env.local</code> and restart
            the server.
          </p>
        ) : null}
        <Suspense fallback={<div className="admin-panel h-72" />}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
