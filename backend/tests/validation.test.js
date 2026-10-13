import { test } from "node:test";
import assert from "node:assert/strict";
import { analysisRequestSchema, validateAiOutput, idParamSchema } from "../src/validators/analysisSchemas.js";
import { loadEnv } from "../src/config/env.js";
import { JOB_DESCRIPTION, RESUME_TEXT, TEST_ENV, validAiOutput } from "./fixtures.js";

test("valid request passes", () => {
  const r = analysisRequestSchema.safeParse({ resumeText: RESUME_TEXT, jobTitle: "Frontend Developer", targetRole: "Frontend Developer", jobDescription: JOB_DESCRIPTION });
  assert.equal(r.success, true);
});

test("missing fields and short text are rejected with field messages", () => {
  const r = analysisRequestSchema.safeParse({ resumeText: "too short", jobTitle: "", jobDescription: "short" });
  assert.equal(r.success, false);
  const fields = r.error.issues.map((i) => i.path[0]);
  assert.ok(fields.includes("resumeText"));
  assert.ok(fields.includes("jobTitle"));
  assert.ok(fields.includes("targetRole"));
  assert.ok(fields.includes("jobDescription"));
});

test("oversized resume text is rejected", () => {
  const r = analysisRequestSchema.safeParse({ resumeText: "a".repeat(30001), jobTitle: "x", targetRole: "y", jobDescription: JOB_DESCRIPTION });
  assert.equal(r.success, false);
});

test("id param rejects injection-looking values", () => {
  assert.equal(idParamSchema.safeParse({ id: "cm2abcdefghijklmnopqrstuv" }).success, true);
  assert.equal(idParamSchema.safeParse({ id: "1 OR 1=1" }).success, false);
  assert.equal(idParamSchema.safeParse({ id: "../etc" }).success, false);
});

test("well-formed AI output validates", () => {
  const r = validateAiOutput(validAiOutput());
  assert.equal(r.ok, true);
});

test("malformed AI output is rejected with readable issues", () => {
  const bad = validAiOutput();
  bad.matchedSkills[0].evidenceType = "guess"; // invalid enum
  delete bad.summary;
  bad.interviewQuestions = []; // below minimum
  const r = validateAiOutput(bad);
  assert.equal(r.ok, false);
  assert.ok(r.issues.some((i) => i.startsWith("summary")));
  assert.ok(r.issues.some((i) => i.includes("matchedSkills.0.evidenceType")));
  assert.ok(r.issues.some((i) => i.startsWith("interviewQuestions")));
});

test("AI output with an unexpected shape (e.g. a string) is rejected", () => {
  assert.equal(validateAiOutput("not json").ok, false);
  assert.equal(validateAiOutput(null).ok, false);
  assert.equal(validateAiOutput({ matchScore: 99 }).ok, false);
});

test("environment validation fails fast on a short JWT secret or bad provider", () => {
  assert.throws(() => loadEnv({ ...TEST_ENV, JWT_SECRET: "short" }), /JWT_SECRET/);
  assert.throws(() => loadEnv({ ...TEST_ENV, LLM_PROVIDER: "openai" }), /LLM_PROVIDER/);
  assert.throws(() => loadEnv({ ...TEST_ENV, DATABASE_URL: "" }), /DATABASE_URL/);
});

test("environment defaults model per provider and flags unconfigured keys", () => {
  const a = loadEnv({ ...TEST_ENV, LLM_API_KEY: "" });
  assert.equal(a.LLM_MODEL, "claude-opus-5-5");
  assert.equal(a.LLM_CONFIGURED, false);
  const g = loadEnv({ ...TEST_ENV, LLM_PROVIDER: "gemini" });
  assert.equal(g.LLM_MODEL, "gemini-1.5-flash");
  assert.equal(g.LLM_CONFIGURED, true);
  assert.deepEqual(g.FRONTEND_ORIGINS, ["http://localhost:3001"]);
});
