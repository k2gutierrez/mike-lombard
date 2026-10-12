import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasSupabaseService } from "@/lib/config";

export type AdminIdentity = {
  id: string;
  email: string;
  role: "owner" | "editor";
};

/**
 * Emails allowed into /admin. Combined with `ml_admin_roles`:
 *   - first sign-in from an allowlisted email is promoted into the roles table,
 *   - afterwards the table is the single source of truth (RLS uses it too).
 * Keeping the env list means Mike can be onboarded by editing one variable.
 */
function allowedAdminEmails(): string[] {
  return (process.env.ML_ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return allowedAdminEmails().includes(email.trim().toLowerCase());
}

/** Reads the Supabase session from cookies. Never trusts client state. */
export async function getCurrentAdmin(): Promise<AdminIdentity | null> {
  if (!hasSupabaseService) return null;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.email) return null;

  const admin = createSupabaseAdminClient();
  const { data: role } = await admin
    .from("ml_admin_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (role?.role) {
    return { id: user.id, email: user.email, role: role.role as AdminIdentity["role"] };
  }

  // Allowlisted email but no row yet: promote once, on the server.
  if (isAdminEmail(user.email)) {
    const { error: insertError } = await admin
      .from("ml_admin_roles")
      .upsert({ user_id: user.id, role: "owner" }, { onConflict: "user_id" });
    if (!insertError) {
      return { id: user.id, email: user.email, role: "owner" };
    }
  }

  return null;
}

/** Throws a 401-shaped error for route handlers and server actions. */
export class UnauthorizedError extends Error {
  constructor(message = "Not authorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export async function requireAdmin(): Promise<AdminIdentity> {
  const admin = await getCurrentAdmin();
  if (!admin) throw new UnauthorizedError();
  return admin;
}

export async function recordAudit(input: {
  actor: AdminIdentity;
  action: string;
  entity: string;
  entityId?: string | null;
  detail?: unknown;
}) {
  try {
    const admin = createSupabaseAdminClient();
    await admin.from("ml_audit_log").insert({
      actor_id: input.actor.id,
      actor_email: input.actor.email,
      action: input.action,
      entity: input.entity,
      entity_id: input.entityId ?? null,
      detail: input.detail ?? null,
    });
  } catch {
    // Auditing must never break the operation it records.
  }
}
