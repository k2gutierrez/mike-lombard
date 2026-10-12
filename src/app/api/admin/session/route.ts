import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getCurrentAdmin();
  return NextResponse.json(
    { ok: true, admin },
    { headers: { "cache-control": "no-store" } },
  );
}
