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
 * In demo mode (no Supabase configured) the panel is local-only, so previewing is
 * safe by definition: there is no production data in the process.
 */
export async function resolvePreview(requested: boolean | undefined): Promise<boolean> {
  if (!requested) return false;
  if (!hasSupabaseService) return true;
  const admin = await getCurrentAdmin();
  return Boolean(admin);
}
