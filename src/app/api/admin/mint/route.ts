import { NextResponse } from "next/server";
import { UnauthorizedError, requireAdmin } from "@/lib/server/auth";
import { listMintInterest } from "@/lib/server/admin-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin-only read of the mint registrations shown in the panel. */
export async function GET() {
  try {
    await requireAdmin();
    const rows = await listMintInterest();
    return NextResponse.json(
      { ok: true, rows },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: "Could not load registrations." }, { status: 500 });
  }
}
