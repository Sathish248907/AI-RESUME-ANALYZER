import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    const where = userId ? { userId } : {};

    const analyses = await prisma.analysis.findMany({
      where,
      include: {
        resume: {
          select: { id: true, fileName: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ analyses });
  } catch (err) {
    console.error("history error:", err);
    return NextResponse.json({ analyses: [] });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    await prisma.analysis.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("delete error:", err);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
