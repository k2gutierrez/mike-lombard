import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabasePublicKey, supabaseUrl } from "@/lib/config";
import { getCurrentAdmin } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  // Only a real admin session may sign out through this endpoint; otherwise an
  // anonymous POST could clear someone else's cookies on a shared browser.
  const admin = await getCurrentAdmin().catch(() => null);
  if (admin) {
    const cookieStore = await cookies();
    const supabase = createServerClient(supabaseUrl, supabasePublicKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        },
      },
    });
    await supabase.auth.signOut();
  }
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
