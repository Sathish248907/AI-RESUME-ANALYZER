/**
 * /api/history — the legacy (Phase 1) analysis history, backed by the `legacy`
 * schema rather than the Express backend's `api_*` tables.
 *
 * Both handlers are scoped to the authenticated caller. Before Phase 15 they
 * were not: `GET` with no `userId` returned the fifty most recent analyses
 * belonging to *everyone*, including full job-description text, and `DELETE`
 * removed any row by id with no ownership check at all. The caller's identity
 * now comes only from the backend-verified token — never from a query string.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCaller, UNAUTHENTICATED } from "@/lib/requireUser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_RECORDS = 50;

export async function GET(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json(UNAUTHENTICATED, { status: 401 });

  try {
    const analyses = await prisma.analysis.findMany({
      where: { userId: caller.id },
      include: { resume: { select: { id: true, fileName: true } } },
      orderBy: { createdAt: "desc" },
      take: MAX_RECORDS,
    });
    return NextResponse.json({ analyses });
  } catch (err) {
    console.error("history read failed:", (err as Error)?.message);
    return NextResponse.json(
      { error: "History is temporarily unavailable." },
      { status: 503 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json(UNAUTHENTICATED, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  try {
    // deleteMany with the owner in the filter: a row belonging to someone else
    // matches nothing, so it cannot be deleted and its existence is not leaked.
    const { count } = await prisma.analysis.deleteMany({
      where: { id, userId: caller.id },
    });
    if (count === 0) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("history delete failed:", (err as Error)?.message);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
