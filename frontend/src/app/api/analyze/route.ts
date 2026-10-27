/**
 * /api/analyze — the legacy (Phase 1) one-shot analysis behind the public
 * `/analyze` page. It calls Gemini directly and persists to the `legacy`
 * schema.
 *
 * Phase 15 changes three things:
 *   1. The owner of a saved record comes from the backend-verified token, never
 *      from the request body. Accepting `userId` from the client let anyone
 *      write rows into another account's history.
 *   2. Input is bounded. An unbounded resume or job description is an unbounded
 *      bill at the provider.
 *   3. Provider errors are no longer echoed to the client — the message could
 *      carry request ids, model names or quota details.
 *
 * The endpoint stays usable without signing in, because the public page is the
 * product's front door; an anonymous run is simply not saved.
 */
import { NextRequest, NextResponse } from "next/server";
import { analyzeResumeWithAI } from "@/lib/gemini";
import { prisma } from "@/lib/prisma";
import { getCaller } from "@/lib/requireUser";
import { takeToken, clientKey } from "@/lib/rateLimit";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Caps chosen so one request cannot become an unbounded provider bill. */
const MAX_RESUME_CHARS = 30_000;
const MAX_JOB_CHARS = 20_000;

const bodySchema = z.object({
  resumeText: z.string().min(50, "Resume text too short").max(MAX_RESUME_CHARS, "Resume text is too long to analyse."),
  jobDescription: z.string().min(30, "Job description too short").max(MAX_JOB_CHARS, "Job description is too long to analyse."),
  jobTitle: z.string().min(2, "Job title required").max(200),
  fileName: z.string().max(260).optional(),
  fileSize: z.number().int().min(0).max(10 * 1024 * 1024).optional(),
  mimeType: z.string().max(120).optional(),
  // `userId` is deliberately absent: the caller does not get to choose an owner.
});

export async function POST(req: NextRequest) {
  const caller = await getCaller(req);

  // Signed-in callers get their own budget; everyone else shares one per IP.
  const limit = takeToken(clientKey(req, caller?.id), { limit: caller ? 20 : 5, windowMs: 15 * 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many analyses from here. Please wait a few minutes and try again." },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body is not valid JSON." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }
  const { resumeText, jobDescription, jobTitle, fileName, fileSize, mimeType } = parsed.data;

  let result;
  try {
    result = await analyzeResumeWithAI(resumeText, jobDescription, jobTitle);
  } catch (err) {
    console.error("analyze provider error:", (err as Error)?.message);
    return NextResponse.json(
      { error: "The analysis service is unavailable right now. Please try again shortly." },
      { status: 502 }
    );
  }

  // Persisting is best effort: an analysis the user can read is worth more than
  // a 500 because the legacy schema is not migrated. An anonymous run is not
  // saved at all — there is no account to save it to.
  let analysisId: string | null = null;
  if (caller) {
    try {
      const resume = await prisma.resume.create({
        data: {
          fileName: fileName ?? "resume",
          fileSize: fileSize ?? 0,
          mimeType: mimeType ?? "application/pdf",
          text: resumeText,
          userId: caller.id,
        },
      });
      const analysis = await prisma.analysis.create({
        data: {
          resumeId: resume.id,
          jobTitle,
          jobDescription,
          matchScore: result.matchScore,
          result: result as object,
          userId: caller.id,
        },
      });
      analysisId = analysis.id;
    } catch (dbErr) {
      console.warn("analysis not saved:", (dbErr as Error)?.message);
    }
  }

  return NextResponse.json({ result, analysisId, saved: analysisId !== null });
}
