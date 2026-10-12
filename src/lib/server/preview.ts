import { connection } from "next/server";
import { hasSupabaseService } from "@/lib/config";
import { getCurrentAdmin } from "@/lib/server/auth";

/**
 * Draft preview for administrators.
 *
 * Preview renders the real pages from draft rows. The draft read still goes
 * through the publishable key and RLS, so a visitor without an admin session sees
 * published data only — this flag only tells the loader that it may *ask* for
 * drafts, it cannot grant access.
 *
 * `connection()` is essential, not cosmetic: reading cookies makes the render
 * dynamic, and Next refuses (DYNAMIC_SERVER_USAGE) to do that when it has already
 * started rendering statically. Awaiting a real request first tells it up front.
 * Preview pages are generated per request by design.
 *
 * In demo mode (no Supabase configured) the panel is local-only, so previewing is
 * safe by definition: there is no production data in the process.
 */
export async function resolvePreview(requested: boolean | undefined): Promise<boolean> {
  if (!requested) return false;
  // Wait for a real request. This is the supported way to say "this render needs
  // a live request" (reading cookies later would otherwise raise
  // DYNAMIC_SERVER_USAGE on a route Next had decided to render statically).
  await connection();
  if (!hasSupabaseService) return true;
  const admin = await getCurrentAdmin();
  return Boolean(admin);
}
