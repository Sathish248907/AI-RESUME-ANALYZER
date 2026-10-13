import { NextRequest, NextResponse } from "next/server";
import { analyzeResumeWithAI } from "@/lib/gemini";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  resumeText: z.string().min(50, "Resume text too short"),
  jobDescription: z.string().min(30, "Job description too short"),
  jobTitle: z.string().min(2, "Job title required"),
  fileName: z.string().optional(),
  fileSize: z.number().optional(),
  mimeType: z.string().optional(),
  userId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = bodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const { resumeText, jobDescription, jobTitle, fileName, fileSize, mimeType, userId } =
      parsed.data;

    // Run AI analysis
    const result = await analyzeResumeWithAI(resumeText, jobDescription, jobTitle);

    // Persist to database (best-effort — don't fail the response if DB is unavailable)
    let analysisId: string | null = null;
    try {
      const resume = await prisma.resume.create({
        data: {
          fileName: fileName ?? "resume",
          fileSize: fileSize ?? 0,
          mimeType: mimeType ?? "application/pdf",
          text: resumeText,
          userId: userId ?? null,
        },
      });

      const analysis = await prisma.analysis.create({
        data: {
          resumeId: resume.id,
          jobTitle,
          jobDescription,
          matchScore: result.matchScore,
          result: result as object,
          userId: userId ?? null,
        },
      });
      analysisId = analysis.id;
    } catch (dbErr) {
      // DB not set up yet — still return the result
      console.warn("DB save skipped:", dbErr);
    }

    return NextResponse.json({ result, analysisId });
  } catch (err: unknown) {
    console.error("analyze error:", err);
    const message =
      err instanceof Error ? err.message : "Analysis failed. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
