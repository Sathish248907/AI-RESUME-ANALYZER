import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AnalysisResult, JobDescriptionParsed } from "@/types";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");
// gemini-1.5-flash was retired; override with GEMINI_MODEL if needed.
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-flash-latest";

export async function analyzeResumeWithAI(
  resumeText: string,
  jobDescription: string,
  jobTitle: string
): Promise<AnalysisResult> {
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

  const prompt = `
You are an expert HR recruiter and ATS (Applicant Tracking System) specialist. 
Analyze the following resume against the job description and return a structured JSON response.

JOB TITLE: ${jobTitle}

JOB DESCRIPTION:
${jobDescription}

RESUME TEXT:
${resumeText}

Analyze and return ONLY a valid JSON object (no markdown, no code blocks) with this exact structure:
{
  "matchScore": <integer 0-100, estimate how well the resume matches the job>,
  "matchedSkills": [<array of skill strings found in both resume and job description>],
  "missingSkills": [<array of skills required by job but not found in resume>],
  "strengths": [<array of 3-5 key strengths the candidate has for this role>],
  "suggestions": [<array of 4-6 specific, actionable improvement suggestions>],
  "atsIssues": [<array of potential ATS problems like missing keywords, formatting issues>],
  "interviewQuestions": [<array of 5-7 likely interview questions based on the job and resume>],
  "experienceAlignment": "<one sentence on how well their experience aligns>",
  "educationAlignment": "<one sentence on education alignment>",
  "keywordAnalysis": {
    "found": [<important job keywords found in resume>],
    "missing": [<important job keywords missing from resume>]
  }
}

Rules:
- matchScore must be an honest estimate, not inflated. Base it on skills overlap, experience, and keyword density.
- Keep each suggestion under 15 words and make it specific.
- Do not add any text outside the JSON object.
`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  // Strip markdown code blocks if present
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as AnalysisResult;
    // Validate matchScore is a number
    if (typeof parsed.matchScore !== "number") {
      parsed.matchScore = Number(parsed.matchScore) || 0;
    }
    parsed.matchScore = Math.min(100, Math.max(0, parsed.matchScore));
    return parsed;
  } catch {
    throw new Error("AI returned an invalid response. Please try again.");
  }
}

export async function parseJobDescription(
  jobDescription: string
): Promise<JobDescriptionParsed> {
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

  const prompt = `
Extract structured information from this job description. Return ONLY a valid JSON object (no markdown):

JOB DESCRIPTION:
${jobDescription}

Return this exact structure:
{
  "role": "<job title>",
  "skills": [<array of required technical and soft skills>],
  "experience": "<experience requirement string>",
  "education": "<education requirement string>",
  "responsibilities": [<array of up to 5 key responsibilities>]
}
`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  return JSON.parse(cleaned) as JobDescriptionParsed;
}
