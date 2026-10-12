import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/server/auth";
import { loadAdminDocument } from "@/lib/server/admin-data";
import { AdminApp } from "@/components/admin/admin-app";
import { hasSupabaseService as hasPublicSupabase } from "@/lib/config";
import { hasServiceKey } from "@/lib/supabase/admin";

// The panel needs the service-role key at runtime, which on some hosts only
// exists because it was inlined into the build.
const hasSupabaseService = hasPublicSupabase || hasServiceKey;

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Content studio",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const admin = await getCurrentAdmin();

  if (!admin) {
    // Without a backend there is nothing to authenticate against: the panel runs
    // in demo mode with provisional data and says so on screen.
    if (!hasSupabaseService) {
      const document = await loadAdminDocument();
      return <AdminApp document={document} admin={null} previewOnly />;
    }
    redirect("/admin/login");
  }

  const document = await loadAdminDocument();

  return <AdminApp document={document} admin={admin} previewOnly={false} />;
}
