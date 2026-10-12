"use client";
import { createBrowserClient } from "@supabase/ssr";
import { supabasePublicKey, supabaseUrl } from "@/lib/config";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

/**
 * Browser client with the publishable key. Used for session handling and magic
 * link sign-in only — it can never read drafts or mint registrations (RLS).
 */
export function getSupabaseBrowserClient() {
  if (!supabaseUrl || !supabasePublicKey) return null;
  browserClient ??= createBrowserClient(supabaseUrl, supabasePublicKey);
  return browserClient;
}
