/**
 * scoringService.js — transparent, application-defined match score.
 *
 * The LLM never decides the number. It supplies evidence-backed classifications
 * (matched / partial / missing skills with priorities, experience and education
 * alignment) and this module turns them into a 0–100 estimate using the weights
 * below. The breakdown is returned so the UI can explain the score.
 *
 * Weights (sum to 1.0 when every component is applicable):
 *   requiredSkills  0.45  — required skills: matched = 1, partial = 0.5, missing = 0
 *   preferredSkills 0.15  — preferred/unknown-priority skills, same credit rule
 *   experience      0.25  — yes = 1, partial = 0.5, no = 0, unknown = not applicable
 *   education       0.15  — same mapping; not applicable when the job states no requirement
 *
 * A component that is "not applicable" is dropped and the remaining weights are
 * re-normalised, so a job with no education requirement is not penalised.
 */

export const DEFAULT_WEIGHTS = Object.freeze({
  requiredSkills: 0.45,
  preferredSkills: 0.15,
  experience: 0.25,
  education: 0.15,
});

export const CREDIT = Object.freeze({ matched: 1, partial: 0.5, missing: 0 });
export const ALIGNMENT_CREDIT = Object.freeze({ yes: 1, partial: 0.5, no: 0, unknown: null });

/** Below this many classified skills the estimate is considered low-evidence. */
export const MIN_SKILLS_FOR_CONFIDENCE = 4;

function skillBucket(aiResult, predicate) {
  const matched = aiResult.matchedSkills.filter(predicate).length;
  const partial = aiResult.partiallyMatchedSkills.filter(predicate).length;
  const missing = aiResult.missingOrUnverifiedSkills.filter(predicate).length;
  const total = matched + partial + missing;
  const earned = matched * CREDIT.matched + partial * CREDIT.partial;
  return { matched, partial, missing, total, earned, ratio: total === 0 ? null : earned / total };
}

/**
 * @param {import("zod").infer<typeof import("../validators/analysisSchemas.js").aiAnalysisOutputSchema>} aiResult
 * @param {Partial<typeof DEFAULT_WEIGHTS>} [weightOverrides]
 */
export function calculateMatchScore(aiResult, weightOverrides = {}) {
  const weights = { ...DEFAULT_WEIGHTS, ...weightOverrides };

  const required = skillBucket(aiResult, (s) => s.priority === "required");
  const preferred = skillBucket(aiResult, (s) => s.priority !== "required");

  // If the model tagged nothing as required, treat every skill as one bucket under the combined weight.
  const components = [];
  if (required.total > 0) {
    components.push({ key: "requiredSkills", label: "Required skills", weight: weights.requiredSkills, ratio: required.ratio, detail: required });
    if (preferred.total > 0) {
      components.push({ key: "preferredSkills", label: "Preferred skills", weight: weights.preferredSkills, ratio: preferred.ratio, detail: preferred });
    }
  } else if (preferred.total > 0) {
    components.push({
      key: "allSkills",
      label: "Skills (priority not stated in the job description)",
      weight: weights.requiredSkills + weights.preferredSkills,
      ratio: preferred.ratio,
      detail: preferred,
    });
  }

  const expCredit = ALIGNMENT_CREDIT[aiResult.experienceAlignment.meetsRequirement];
  if (expCredit !== null && expCredit !== undefined) {
    components.push({ key: "experience", label: "Experience alignment", weight: weights.experience, ratio: expCredit, detail: { meetsRequirement: aiResult.experienceAlignment.meetsRequirement } });
  }

  const eduStated = aiResult.educationAlignment.jobRequirements.length > 0;
  const eduCredit = ALIGNMENT_CREDIT[aiResult.educationAlignment.meetsRequirement];
  if (eduStated && eduCredit !== null && eduCredit !== undefined) {
    components.push({ key: "education", label: "Education / certifications", weight: weights.education, ratio: eduCredit, detail: { meetsRequirement: aiResult.educationAlignment.meetsRequirement } });
  }

  const totalWeight = components.reduce((s, c) => s + c.weight, 0);
  const totalSkills = required.total + preferred.total;

  if (components.length === 0 || totalWeight === 0 || totalSkills === 0) {
    return {
      score: null,
      insufficientEvidence: true,
      explanation:
        "Not enough evidence was extracted to calculate a meaningful score. The resume or job description may be too sparse, or the text could not be interpreted.",
      breakdown: [],
      weights,
      totalSkills,
    };
  }

  const weighted = components.reduce((s, c) => s + (c.weight / totalWeight) * c.ratio, 0);
  const score = Math.round(Math.min(100, Math.max(0, weighted * 100)));
  const lowEvidence = totalSkills < MIN_SKILLS_FOR_CONFIDENCE;

  const breakdown = components.map((c) => ({
    key: c.key,
    label: c.label,
    weight: Math.round((c.weight / totalWeight) * 100) / 100,
    ratio: Math.round(c.ratio * 100) / 100,
    contribution: Math.round((c.weight / totalWeight) * c.ratio * 100),
    detail: c.detail,
  }));

  const parts = breakdown.map((b) => `${b.label} ${Math.round(b.ratio * 100)}% × weight ${Math.round(b.weight * 100)}%`);
  const explanation =
    `Application-defined estimate: ${parts.join("; ")}. ` +
    "Matched skills earn full credit, partial matches half, missing or unverified skills none. " +
    (lowEvidence ? `Only ${totalSkills} skills could be classified, so treat this number as low-confidence. ` : "") +
    "This is not a hiring probability.";

  return { score, insufficientEvidence: false, lowEvidence, explanation, breakdown, weights, totalSkills };
}
