import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateMatchScore, DEFAULT_WEIGHTS } from "../src/services/resume/scoringService.js";

const skill = (name, priority, extra = {}) => ({ name, category: "Frontend", priority, evidence: "e", evidenceType: "direct", ...extra });
const missing = (name, priority) => ({ name, category: "Frontend", priority, reason: "not found" });

function base(overrides = {}) {
  return {
    matchedSkills: [],
    partiallyMatchedSkills: [],
    missingOrUnverifiedSkills: [],
    experienceAlignment: { resumeEvidence: [], jobRequirements: [], assessment: "", meetsRequirement: "unknown" },
    educationAlignment: { resumeEvidence: [], jobRequirements: [], assessment: "", meetsRequirement: "unknown" },
    ...overrides,
  };
}

test("weights sum to 1", () => {
  const sum = Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test("perfect match scores 100", () => {
  const r = calculateMatchScore(
    base({
      matchedSkills: [skill("React", "required"), skill("TS", "required"), skill("Jest", "preferred"), skill("CSS", "unknown")],
      experienceAlignment: { resumeEvidence: ["5y"], jobRequirements: ["5y"], assessment: "", meetsRequirement: "yes" },
      educationAlignment: { resumeEvidence: ["BSc"], jobRequirements: ["BSc"], assessment: "", meetsRequirement: "yes" },
    })
  );
  assert.equal(r.score, 100);
  assert.equal(r.insufficientEvidence, false);
  assert.equal(r.lowEvidence, false);
});

test("nothing matched scores 0", () => {
  const r = calculateMatchScore(
    base({
      missingOrUnverifiedSkills: [missing("React", "required"), missing("TS", "required"), missing("Jest", "preferred"), missing("CSS", "unknown")],
      experienceAlignment: { resumeEvidence: [], jobRequirements: ["5y"], assessment: "", meetsRequirement: "no" },
    })
  );
  assert.equal(r.score, 0);
});

test("partial matches earn half credit and unknown alignment is excluded", () => {
  const r = calculateMatchScore(
    base({
      matchedSkills: [skill("A", "required")],
      partiallyMatchedSkills: [skill("B", "required", { gap: "g" }), skill("C", "required", { gap: "g" })],
      missingOrUnverifiedSkills: [missing("D", "required")],
      // experience unknown, education not stated → only required bucket counts
    })
  );
  // earned = 1 + 0.5 + 0.5 = 2 of 4 → 50%
  assert.equal(r.score, 50);
  assert.equal(r.breakdown.length, 1);
  assert.equal(r.breakdown[0].key, "requiredSkills");
  assert.equal(r.breakdown[0].weight, 1);
});

test("education without a job requirement is not applicable", () => {
  const r = calculateMatchScore(
    base({
      matchedSkills: [skill("A", "required"), skill("B", "required"), skill("C", "required"), skill("D", "required")],
      educationAlignment: { resumeEvidence: [], jobRequirements: [], assessment: "", meetsRequirement: "no" },
    })
  );
  assert.equal(r.score, 100);
  assert.ok(!r.breakdown.some((b) => b.key === "education"));
});

test("skills without stated priority use a single combined bucket", () => {
  const r = calculateMatchScore(
    base({
      matchedSkills: [skill("A", "unknown"), skill("B", "preferred")],
      missingOrUnverifiedSkills: [missing("C", "unknown"), missing("D", "unknown")],
    })
  );
  assert.equal(r.score, 50);
  assert.equal(r.breakdown[0].key, "allSkills");
  assert.ok(Math.abs(r.breakdown[0].weight - 1) < 1e-9);
});

test("insufficient evidence returns null score and a limitation", () => {
  const r = calculateMatchScore(base());
  assert.equal(r.score, null);
  assert.equal(r.insufficientEvidence, true);
  assert.match(r.explanation, /Not enough evidence/);
});

test("few skills flagged as low evidence", () => {
  const r = calculateMatchScore(base({ matchedSkills: [skill("A", "required")], missingOrUnverifiedSkills: [missing("B", "required")] }));
  assert.equal(r.score, 50);
  assert.equal(r.lowEvidence, true);
  assert.match(r.explanation, /low-confidence/);
});

test("score is always clamped to 0–100 and explanation says it is an estimate", () => {
  const r = calculateMatchScore(base({ matchedSkills: [skill("A", "required"), skill("B", "required")] }), { requiredSkills: 5 });
  assert.ok(r.score >= 0 && r.score <= 100);
  assert.match(r.explanation, /not a hiring probability/i);
});
