import { NextResponse } from "next/server";
import { UnauthorizedError, requireAdmin, recordAudit } from "@/lib/server/auth";
import { listMintInterest } from "@/lib/server/admin-data";
import { toCsv } from "@/lib/sanitize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLUMNS = [
  "id",
  "created_at",
  "email",
  "wallet_address",
  "wallet_chain_id",
  "wallet_source",
  "consent",
  "consent_at",
  "source",
  "note",
];

/** Admin-only export of the mint registrations. Never public. */
export async function GET() {
  try {
    const admin = await requireAdmin();
    const rows = await listMintInterest();

    const csv = toCsv(
      rows.map((row) => ({
        id: row.id,
        created_at: row.createdAt,
        email: row.email,
        wallet_address: row.walletAddress ?? "",
        wallet_chain_id: row.walletChainId ?? "",
        wallet_source: row.walletSource ?? "",
        consent: row.consent ? "yes" : "no",
        consent_at: row.consentAt,
        source: row.source ?? "",
        note: row.note ?? "",
      })),
      COLUMNS,
    );

    await recordAudit({
      actor: admin,
      action: "export-mint-csv",
      entity: "ml_mint_interest",
      detail: { rows: rows.length },
    });

    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="mike-lombard-mint-interest-${stamp}.csv"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: "Export failed." }, { status: 500 });
  }
}
