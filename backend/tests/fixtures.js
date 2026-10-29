/** Shared fixtures for backend tests. */

export const RESUME_TEXT = `Jane Doe
jane.doe@example.com · +1 555 123 4567 · linkedin.com/in/janedoe

Summary
Frontend developer with 4 years of experience building React applications.

Experience
Frontend Developer — Acme Corp (2021 – 2024)
- Built a React and TypeScript design system used by 12 product teams
- Improved Lighthouse performance score from 61 to 94
- Wrote unit tests with Jest and React Testing Library

Education
B.Sc. Computer Science, State University (2017 – 2021)

Skills
React, TypeScript, JavaScript, HTML, CSS, Jest, Git, REST APIs`;

export const JOB_DESCRIPTION = `Senior Frontend Developer
Requirements
- 5+ years of experience building web applications
- Strong experience with React and TypeScript
- Proficient in HTML and CSS
- Experience with GraphQL is required
Nice to have
- Familiarity with Next.js
- Exposure to AWS
Bachelor's degree in Computer Science or related field preferred.`;

export function validAiOutput() {
  return {
    summary: "The resume shows solid React and TypeScript experience but falls short of the stated 5 years.",
    matchedSkills: [
      { name: "React", category: "Frontend", priority: "required", evidence: "Built a React and TypeScript design system", evidenceType: "direct" },
      { name: "TypeScript", category: "Frontend", priority: "required", evidence: "React and TypeScript design system", evidenceType: "direct" },
      { name: "HTML", category: "Frontend", priority: "required", evidence: "Skills: HTML, CSS", evidenceType: "direct" },
      { name: "CSS", category: "Frontend", priority: "required", evidence: "Skills: HTML, CSS", evidenceType: "direct" },
    ],
    partiallyMatchedSkills: [
      { name: "Next.js", category: "Frontend", priority: "preferred", evidence: "React experience", evidenceType: "inferred", gap: "Next.js itself is not mentioned." },
    ],
    missingOrUnverifiedSkills: [
      { name: "GraphQL", category: "Backend", priority: "required", reason: "Not found in the supplied resume text." },
      { name: "AWS", category: "Cloud/DevOps", priority: "preferred", reason: "Not mentioned." },
    ],
    strengths: ["Quantified performance improvement", "Testing experience"],
    improvementSuggestions: [
      { title: "Quantify design-system adoption", description: "State the number of components and teams.", type: "achievement", priority: "medium" },
    ],
    keywordAnalysis: {
      foundKeywords: ["React", "TypeScript", "HTML", "CSS"],
      missingOrUnverifiedKeywords: ["GraphQL", "AWS", "Next.js"],
      recommendedKeywords: ["Web applications"],
    },
    experienceAlignment: {
      resumeEvidence: ["4 years of experience"],
      jobRequirements: ["5+ years of experience"],
      assessment: "One year short of the stated requirement.",
      meetsRequirement: "partial",
    },
    educationAlignment: {
      resumeEvidence: ["B.tech information technology"],
      jobRequirements: ["Bachelor's degree in Computer Science preferred"],
      assessment: "Meets the preferred education.",
      meetsRequirement: "yes",
    },
    atsChecks: [{ name: "Action verbs", status: "pass", explanation: "Bullets start with strong verbs.", verifiability: "heuristic" }],
    interviewQuestions: [
      { question: "How did you structure the design system?", category: "Project", difficulty: "Intermediate", reason: "Design system on resume." },
      { question: "Explain React reconciliation.", category: "Technical", difficulty: "Intermediate", reason: "Core required skill." },
      { question: "Tell me about a performance problem you solved.", category: "Behavioral", difficulty: "Beginner", reason: "Lighthouse improvement." },
    ],
    limitations: ["GraphQL could not be verified from the text."],
  };
}

/** A fake LLM provider whose behaviour can be swapped per test. */
export function fakeLlm(behaviour = defaultBehaviour) {
  return {
    name: "fake",
    model: "fake-model",
    calls: 0,
    lastRequest: null,
    async generateStructured(req) {
      this.calls += 1;
      this.lastRequest = req;
      const out = await behaviour(req);
      // Mirror the real provider: output must satisfy the requested schema.
      const parsed = req.schema.safeParse(out);
      if (!parsed.success) {
        const err = new Error("fake provider output failed schema validation: " + parsed.error.issues.slice(0, 3).map((i) => i.path.join(".") + ": " + i.message).join("; "));
        err.status = 502;
        throw err;
      }
      return { data: parsed.data, usage: { inputTokens: 1, outputTokens: 1 }, provider: "fake", model: "fake-model" };
    },
  };
}

function defaultBehaviour(req) {
  if (req.schemaName === "interview_questions") return validQuestionBatch(req);
  if (req.schemaName === "answer_evaluation") return validEvaluation(req);
  if (req.schemaName === "learning_roadmap") return validRoadmapOutput(req);
  if (req.schemaName === "resume_structure") return validResumeStructure(req);
  if (req.schemaName === "resume_improvements") return validImprovements(req);
  if (req.schemaName === "resume_tailoring") return validTailoring(req);
  if (req.schemaName === "resume_assistant") return validAssistantReply(req);
  if (req.schemaName === "resume_suggestion_regenerate") return validRegeneratedSuggestion(req);
  if (req.schemaName === "career_coach") return validCoachReply(req);
  if (req.schemaName === "progress_report") return validProgressNarrative(req);
  return validAiOutput();
}

/**
 * Writing-assistant reply. Proposes one in-scope draft, one out-of-scope draft
 * (must be discarded), and one draft carrying an invented metric (must come
 * back flagged needsConfirmation).
 */
export function validAssistantReply(req) {
  const user = req?.user ?? "";
  const fields = [...user.matchAll(/- sectionId=(\S+) entryId=(\S+) field=(\S+)[^\n]*\n\s+"([^"]*)"/g)]
    .map((m) => ({ sectionId: m[1], entryId: m[2] === "null" ? null : m[2], field: m[3], text: m[4] }));
  const first = fields[0];
  const drafts = [];
  if (first) {
    drafts.push({ sectionId: first.sectionId, entryId: first.entryId, field: first.field, text: `Rewritten: ${first.text}`.slice(0, 600), rationale: "Leads with the action and keeps every original fact." });
    // Invented figure — the fabrication guard must flag this one.
    drafts.push({ sectionId: first.sectionId, entryId: first.entryId, field: first.field, text: "Reduced page load time by 73% for 9,000 monthly users", rationale: "Quantifies the outcome." });
  }
  // A field that was never offered — postProcessAssistant must reject it.
  drafts.push({ sectionId: "s_not_in_scope", entryId: null, field: "summary", text: "Out of scope rewrite", rationale: "Should be dropped." });
  return {
    answer: "Lead each bullet with the action you took, then the effect it had.",
    drafts,
    questions: ["How many users did the dashboard serve?"],
    evidencedSkills: ["React", "TypeScript"],
    skillsToLearn: ["GraphQL"],
  };
}

/** A regenerated single-field suggestion, deliberately different from the previous one. */
export function validRegeneratedSuggestion(req) {
  const current = /Current text:\n"([^"]*)"/.exec(req?.user ?? "")?.[1] ?? "Improved text";
  return {
    suggestedText: `Shipped ${current.charAt(0).toLowerCase()}${current.slice(1)}`.slice(0, 1400),
    rationale: "A different framing that opens on delivery rather than construction.",
    title: "Open on what shipped",
    issue: "The previous rewrite kept the same shape as the original.",
    benefit: "Reads as ownership of an outcome, not a task.",
    priority: "medium",
    missingDetailQuestion: null,
  };
}

/** Progress-report narrative that only reuses numbers present in the supplied metrics. */
export function validProgressNarrative(req) {
  const m = /METRICS \(JSON\):\n(\{.*?\})\n\nDeterministic/s.exec(req?.user ?? "");
  let metrics = null; try { metrics = m ? JSON.parse(m[1]) : null; } catch { metrics = null; }
  const total = metrics?.activities?.total ?? 0;
  return { summary: `You recorded ${total} activities this period. Keep going!`, highlights: total ? [`${metrics.activities.learningTasks} learning tasks completed`] : [], priorities: ["Consider scheduling one mock interview next week."] };
}

/** Grounded coach reply: echoes a recorded fact, adds a suggestion, links to a known page, invents one "fact". */
export function validCoachReply(req) {
  const facts = [...(req?.user ?? "").matchAll(/^- (.+)$/gm)].map((m) => m[1]).filter((f) => !f.includes(": /dashboard"));
  const question = /<user_message>\n([\s\S]*?)\n<\/user_message>/.exec(req?.user ?? "")?.[1] ?? "";
  const first = facts[0] ?? "No facts";
  return {
    reply: `Based on your records (${first.slice(0, 60)}…), I'd suggest focusing on one gap this week. ${/salary|offer/i.test(question) ? "I don't have any offer or salary data on file." : ""}`.trim(),
    factsUsed: [first, "You were hired at Google last week"],
    suggestions: ["Practise one weak topic in a focused mock interview"],
    links: [{ label: "Learning roadmap", path: "/dashboard/learning" }, { label: "Evil", path: "https://evil.example/phish" }, { label: "Admin", path: "/admin" }],
    clarifyingQuestion: /which role|what role|^help$/i.test(question) ? "Which target role should I focus on?" : null,
  };
}

/** Verbatim structure of RESUME_TEXT (what a well-behaved model returns). */
export function validResumeStructure() {
  return {
    personal: { fullName: "Jane Doe", title: "", email: "jane.doe@example.com", phone: "+1 555 123 4567", location: "", website: "", linkedin: "linkedin.com/in/janedoe", github: "" },
    sections: [
      { type: "summary", title: "Summary", text: "Frontend developer with 4 years of experience building React applications." },
      { type: "experience", title: "Experience", entries: [{ role: "Frontend Developer", company: "Acme Corp", location: "", startDate: "2021", endDate: "2024", current: false, bullets: ["Built a React and TypeScript design system used by 12 product teams", "Improved Lighthouse performance score from 61 to 94", "Wrote unit tests with Jest and React Testing Library"] }] },
      { type: "education", title: "Education", entries: [{ degree: "B.Sc. Computer Science", institution: "State University", location: "", startDate: "2017", endDate: "2021", details: [] }] },
      { type: "skills", title: "Skills", groups: [{ name: "", items: ["React", "TypeScript", "JavaScript", "HTML", "CSS", "Jest", "Git", "REST APIs"] }] },
    ],
  };
}

/** Parses the "Editable fields" block of the prompt and rewrites the first two bullets + the summary. */
export function validImprovements(req) {
  const fields = [...(req?.user ?? "").matchAll(/- sectionId=(\S+) entryId=(\S+) field=(\S+) \[[^\]]*\]\n\s+"([^"]*)"/g)].map((m) => ({ sectionId: m[1], entryId: m[2] === "null" ? null : m[2], field: m[3], text: m[4] }));
  const bullets = fields.filter((f) => f.field.startsWith("bullet:")).slice(0, 2);
  const summary = fields.find((f) => f.field === "summary");
  return {
    suggestions: [
      ...bullets.map((b, i) => ({ sectionId: b.sectionId, entryId: b.entryId, field: b.field, category: i === 0 ? "impact" : "clarity", suggestedText: `Delivered ${b.text.charAt(0).toLowerCase()}${b.text.slice(1)} across the platform`, rationale: "Leads with an outcome verb and keeps the original facts.", missingDetailQuestion: null })),
      // Deliberately introduces a number that is not in the resume → must be flagged needsConfirmation
      ...(bullets[0] ? [{ sectionId: bullets[0].sectionId, entryId: bullets[0].entryId, field: "bullet:2", category: "impact", suggestedText: "Cut CI pipeline time by 45% with Kubernetes-based runners", rationale: "Quantifies the result.", missingDetailQuestion: "What was the actual CI time reduction?" }] : []),
    ],
    summaryRewrite: summary ? `${summary.text} Focused on accessible, high-performance interfaces.` : null,
    generalNotes: ["Consider adding a Projects section."],
  };
}

export function validTailoring(req) {
  const base = validImprovements(req);
  return { ...base, keywordsToAdd: ["TypeScript", "GraphQL"], emphasise: [], genuineGaps: ["AWS"] };
}

/** Minimal valid roadmap: 3 milestones, each with ordinary tasks plus one MCQ knowledge checkpoint. */
export function validRoadmapOutput(req) {
  // The prompt lists gaps as numbered lines: "1. GraphQL [Backend] — status: ..."
  const skills = [...(req?.user ?? "").matchAll(/^\d+\.\s+(.+?)\s+\[/gm)].map((m) => m[1].trim()).filter((s) => s.length >= 2);
  const pick = (i, fallback) => skills[i] ?? fallback;
  const task = (skill, type, extra = {}) => ({ title: `${type.replace(/_/g, " ")} — ${skill}`, description: `Work through ${skill} with focus on fundamentals and one applied example.`, skillName: skill, taskType: type, difficulty: "intermediate", estimatedMinutes: 60, isRequired: true, completionCriteria: `Can explain and apply ${skill}.`, resourceHints: ["official docs"], ...extra });
  const mcq = (skill) => ({ type: "mcq", title: `${skill} checkpoint`, instructions: "Answer every question.", passScore: 70, questions: [0, 1, 2].map((i) => ({ question: `${skill} question ${i + 1}?`, options: ["A", "B", "C", "D"], correctIndex: i % 4, explanation: `Option ${i % 4} is correct.` })) });
  const ms = (n, skill, prereqs) => ({ title: `Milestone ${n}: ${skill}`, description: `Build competence in ${skill}.`, requiredSkills: [skill], learningObjectives: [`Understand ${skill}`, `Apply ${skill}`], prerequisiteSequences: prereqs, completionCriteria: `All ${skill} tasks complete.`, tasks: [task(skill, "learn_concept"), task(skill, "coding_exercise"), task(skill, "knowledge_checkpoint", { checkpoint: mcq(skill) })] });
  const s1 = pick(0, "GraphQL"), s2 = pick(1, "AWS"), s3 = pick(2, "Next.js");
  return { title: `Roadmap for ${s1}, ${s2}, ${s3}`, summary: "A compact plan covering the identified gaps in dependency order.", skillGapSummary: `Focus on ${s1}, then ${s2}, then ${s3}.`, milestones: [ms(1, s1, []), ms(2, s2, [1]), ms(3, s3, [2])], notes: ["Generated by the fake provider for tests."] };
}

/** Builds N questions matching the count requested in the prompt ("Create exactly N questions"). */
export function validQuestionBatch(req, count) {
  const m = /Create exactly (\d+) questions/.exec(req?.user ?? "");
  const n = count ?? (m ? parseInt(m[1], 10) : 5);
  const types = ["conceptual", "technical", "project", "scenario", "behavioral", "coding"];
  const topics = ["React state management", "JavaScript closures", "REST API design", "SQL joins", "Team conflict", "Testing strategy"];
  return {
    questions: Array.from({ length: n }, (_, i) => ({
      questionText: `Question ${i + 1}: explain ${topics[i % topics.length]} and give an example from your experience.`,
      category: i % 2 ? "Backend" : "Frontend",
      topic: topics[i % topics.length],
      difficulty: "intermediate",
      questionType: types[i % types.length],
      evaluationCriteria: [
        { criterion: "Technical accuracy", description: "Core concept explained correctly", weight: 5 },
        { criterion: "Clarity", description: "Structured, easy to follow", weight: 3 },
        { criterion: "Example", description: "Includes a concrete example", weight: 2 },
      ],
      keyPoints: ["Definition", "Trade-offs", "Example"],
      suggestedTimeSeconds: 180,
    })),
    notes: [],
  };
}

export function validEvaluation(req, overrides = {}) {
  const answer = /<candidate_answer>\n([\s\S]*?)\n<\/candidate_answer>/.exec(req?.user ?? "")?.[1] ?? "";
  const weak = /weak answer/i.test(answer);
  const score = weak ? 1 : 4;
  return {
    evaluable: true,
    insufficientReason: null,
    strengths: weak ? [] : ["Explains the core concept accurately"],
    improvements: ["Add a practical example"],
    missingConcepts: weak ? ["Error handling", "Trade-offs"] : ["Error handling"],
    incorrectStatements: [],
    criterionFeedback: [
      { criterion: "Technical accuracy", score, maxScore: 5, feedback: "Mostly correct." },
      { criterion: "Clarity", score: weak ? 2 : 4, maxScore: 5, feedback: "Readable." },
      { criterion: "Example", score: weak ? 0 : 3, maxScore: 5, feedback: "Example could be more concrete." },
    ],
    suggestedAnswer: "A stronger answer would define the concept, mention trade-offs and give one concrete example.",
    nextPracticeTopics: ["Error handling"],
    communicationNote: "Clear structure.",
    ...overrides,
  };
}

// ─── Generic in-memory Prisma fake ───────────────────────────────────────────
//
// Supports the subset of the Prisma client API the repositories use:
// create / findFirst / findUnique / findMany / count / update / updateMany /
// delete / deleteMany, with `where` (equality, in, gte/lte/gt/lt, contains,
// OR/AND, one-level relation filters), `orderBy`, `skip`/`take`, `select`
// (incl. nested relation selects and `_count`), `include`, and SetNull /
// Cascade behaviour for the relations declared below.

const RELATIONS = {
  // model: { field: { model, localKey, kind: "one" | "many", foreignKey } }
  user: {
    analyses: { model: "analysis", kind: "many", foreignKey: "userId" },
    resumes: { model: "resume", kind: "many", foreignKey: "userId" },
  },
  resume: {
    user: { model: "user", kind: "one", localKey: "userId" },
    analyses: { model: "analysis", kind: "many", foreignKey: "resumeId" },
    applications: { model: "jobApplication", kind: "many", foreignKey: "resumeId" },
  },
  jobDescription: {
    user: { model: "user", kind: "one", localKey: "userId" },
    analyses: { model: "analysis", kind: "many", foreignKey: "jobDescriptionId" },
    applications: { model: "jobApplication", kind: "many", foreignKey: "jobDescriptionId" },
  },
  analysis: {
    user: { model: "user", kind: "one", localKey: "userId" },
    resume: { model: "resume", kind: "one", localKey: "resumeId" },
    jobDescriptionRef: { model: "jobDescription", kind: "one", localKey: "jobDescriptionId" },
    applications: { model: "jobApplication", kind: "many", foreignKey: "analysisId" },
  },
  jobApplication: {
    user: { model: "user", kind: "one", localKey: "userId" },
    jobDescription: { model: "jobDescription", kind: "one", localKey: "jobDescriptionId" },
    resume: { model: "resume", kind: "one", localKey: "resumeId" },
    analysis: { model: "analysis", kind: "one", localKey: "analysisId" },
  },
  interviewSession: {
    user: { model: "user", kind: "one", localKey: "userId" },
    questions: { model: "interviewQuestion", kind: "many", foreignKey: "sessionId" },
    answers: { model: "interviewAnswer", kind: "many", foreignKey: "sessionId" },
  },
  interviewQuestion: {
    session: { model: "interviewSession", kind: "one", localKey: "sessionId" },
    answer: { model: "interviewAnswer", kind: "one", localKey: "id", foreignKey: "questionId", reverse: true },
  },
  interviewAnswer: {
    session: { model: "interviewSession", kind: "one", localKey: "sessionId" },
    question: { model: "interviewQuestion", kind: "one", localKey: "questionId" },
  },
  learningRoadmap: {
    user: { model: "user", kind: "one", localKey: "userId" },
    milestones: { model: "roadmapMilestone", kind: "many", foreignKey: "roadmapId" },
    skillGaps: { model: "skillGap", kind: "many", foreignKey: "roadmapId" },
  },
  roadmapMilestone: {
    roadmap: { model: "learningRoadmap", kind: "one", localKey: "roadmapId" },
    tasks: { model: "learningTask", kind: "many", foreignKey: "milestoneId" },
  },
  learningTask: {
    milestone: { model: "roadmapMilestone", kind: "one", localKey: "milestoneId" },
    resources: { model: "learningResource", kind: "many", foreignKey: "taskId" },
  },
  learningResource: {
    task: { model: "learningTask", kind: "one", localKey: "taskId" },
  },
  skillGap: {
    user: { model: "user", kind: "one", localKey: "userId" },
    roadmap: { model: "learningRoadmap", kind: "one", localKey: "roadmapId" },
  },
  recommendationDismissal: {
    user: { model: "user", kind: "one", localKey: "userId" },
  },
  resumeVersion: {
    user: { model: "user", kind: "one", localKey: "userId" },
    resume: { model: "resume", kind: "one", localKey: "resumeId" },
    jobDescription: { model: "jobDescription", kind: "one", localKey: "jobDescriptionId" },
    improvements: { model: "resumeImprovement", kind: "many", foreignKey: "versionId" },
    atsAssessments: { model: "resumeAtsAssessment", kind: "many", foreignKey: "versionId" },
    roleRecommendations: { model: "resumeRoleRecommendation", kind: "many", foreignKey: "versionId" },
  },
  resumeImprovement: {
    version: { model: "resumeVersion", kind: "one", localKey: "versionId" },
  },
  resumeAtsAssessment: {
    user: { model: "user", kind: "one", localKey: "userId" },
    version: { model: "resumeVersion", kind: "one", localKey: "versionId" },
    jobDescription: { model: "jobDescription", kind: "one", localKey: "jobDescriptionId" },
  },
  resumeRoleRecommendation: {
    user: { model: "user", kind: "one", localKey: "userId" },
    version: { model: "resumeVersion", kind: "one", localKey: "versionId" },
  },
  resumeTemplatePreference: {
    user: { model: "user", kind: "one", localKey: "userId" },
  },
  careerProfile: { user: { model: "user", kind: "one", localKey: "userId" } },
  userOnboarding: { user: { model: "user", kind: "one", localKey: "userId" } },
  careerAssessment: { user: { model: "user", kind: "one", localKey: "userId" }, recommendations: { model: "careerRecommendation", kind: "many", foreignKey: "assessmentId" } },
  careerRecommendation: { user: { model: "user", kind: "one", localKey: "userId" }, assessment: { model: "careerAssessment", kind: "one", localKey: "assessmentId" } },
  careerActionPlan: { user: { model: "user", kind: "one", localKey: "userId" }, tasks: { model: "careerActionTask", kind: "many", foreignKey: "planId" } },
  careerActionTask: { plan: { model: "careerActionPlan", kind: "one", localKey: "planId" }, user: { model: "user", kind: "one", localKey: "userId" } },
  careerCoachConversation: { user: { model: "user", kind: "one", localKey: "userId" }, messages: { model: "careerCoachMessage", kind: "many", foreignKey: "conversationId" } },
  careerCoachMessage: { conversation: { model: "careerCoachConversation", kind: "one", localKey: "conversationId" } },
  careerProgressSnapshot: { user: { model: "user", kind: "one", localKey: "userId" } },
  gamificationProfile: { user: { model: "user", kind: "one", localKey: "userId" } },
  pointTransaction: { user: { model: "user", kind: "one", localKey: "userId" } },
  userAchievement: { user: { model: "user", kind: "one", localKey: "userId" } },
  userGoal: { user: { model: "user", kind: "one", localKey: "userId" } },
  activityEvent: { user: { model: "user", kind: "one", localKey: "userId" } },
  progressReport: { user: { model: "user", kind: "one", localKey: "userId" } },
  userNotification: { user: { model: "user", kind: "one", localKey: "userId" } },
  // ── Phase 12 ──
  // jobProvider's primary key is `slug`, so it has no id-based children here;
  // the repository never traverses provider -> jobs.
  jobProvider: {},
  externalJob: { savedBy: { model: "savedJob", kind: "many", foreignKey: "externalJobId" }, matchReports: { model: "jobMatchReport", kind: "many", foreignKey: "externalJobId" } },
  savedJob: {
    user: { model: "user", kind: "one", localKey: "userId" },
    externalJob: { model: "externalJob", kind: "one", localKey: "externalJobId" },
    jobDescription: { model: "jobDescription", kind: "one", localKey: "jobDescriptionId" },
    application: { model: "jobApplication", kind: "one", localKey: "applicationId" },
  },
  jobSearchPreference: { user: { model: "user", kind: "one", localKey: "userId" } },
  jobMatchReport: {
    user: { model: "user", kind: "one", localKey: "userId" },
    externalJob: { model: "externalJob", kind: "one", localKey: "externalJobId" },
    jobDescription: { model: "jobDescription", kind: "one", localKey: "jobDescriptionId" },
    resumeVersion: { model: "resumeVersion", kind: "one", localKey: "resumeVersionId" },
  },
  jobAlert: { user: { model: "user", kind: "one", localKey: "userId" } },
  // ── Phase 13 ──
  applicationChecklistItem: { user: { model: "user", kind: "one", localKey: "userId" }, application: { model: "jobApplication", kind: "one", localKey: "applicationId" } },
  coverLetter: {
    user: { model: "user", kind: "one", localKey: "userId" },
    application: { model: "jobApplication", kind: "one", localKey: "applicationId" },
    resumeVersion: { model: "resumeVersion", kind: "one", localKey: "resumeVersionId" },
    documents: { model: "applicationDocument", kind: "many", foreignKey: "coverLetterId" },
  },
  applicationDocument: {
    user: { model: "user", kind: "one", localKey: "userId" },
    application: { model: "jobApplication", kind: "one", localKey: "applicationId" },
    coverLetter: { model: "coverLetter", kind: "one", localKey: "coverLetterId" },
  },
  applicationActivity: { user: { model: "user", kind: "one", localKey: "userId" }, application: { model: "jobApplication", kind: "one", localKey: "applicationId" } },
  applicationReminder: {
    user: { model: "user", kind: "one", localKey: "userId" },
    application: { model: "jobApplication", kind: "one", localKey: "applicationId" },
    interview: { model: "applicationInterview", kind: "one", localKey: "interviewId" },
  },
  applicationInterview: {
    user: { model: "user", kind: "one", localKey: "userId" },
    application: { model: "jobApplication", kind: "one", localKey: "applicationId" },
    mockSession: { model: "interviewSession", kind: "one", localKey: "mockSessionId" },
    reminders: { model: "applicationReminder", kind: "many", foreignKey: "interviewId" },
  },
  // ── Phase 14 ──
  externalIntegration: {
    user: { model: "user", kind: "one", localKey: "userId" },
    syncLogs: { model: "integrationSyncLog", kind: "many", foreignKey: "integrationId" },
    calendarEvents: { model: "externalCalendarEvent", kind: "many", foreignKey: "integrationId" },
    fileExports: { model: "externalFileExport", kind: "many", foreignKey: "integrationId" },
  },
  pendingAuthorization: { user: { model: "user", kind: "one", localKey: "userId" } },
  integrationSyncLog: {
    integration: { model: "externalIntegration", kind: "one", localKey: "integrationId" },
    user: { model: "user", kind: "one", localKey: "userId" },
  },
  externalCalendarEvent: {
    integration: { model: "externalIntegration", kind: "one", localKey: "integrationId" },
    user: { model: "user", kind: "one", localKey: "userId" },
  },
  externalFileExport: {
    integration: { model: "externalIntegration", kind: "one", localKey: "integrationId" },
    user: { model: "user", kind: "one", localKey: "userId" },
  },
  automationRule: {
    user: { model: "user", kind: "one", localKey: "userId" },
    executions: { model: "automationExecution", kind: "many", foreignKey: "ruleId" },
  },
  automationExecution: {
    user: { model: "user", kind: "one", localKey: "userId" },
    rule: { model: "automationRule", kind: "one", localKey: "ruleId" },
  },
  emailDelivery: { user: { model: "user", kind: "one", localKey: "userId" } },
};

/** onDelete behaviour: which foreign keys to null out / which rows to cascade-delete. */
const ON_DELETE = {
  user: { cascade: [["analysis", "userId"], ["resume", "userId"], ["jobDescription", "userId"], ["jobApplication", "userId"], ["interviewSession", "userId"], ["learningRoadmap", "userId"], ["skillGap", "userId"], ["recommendationDismissal", "userId"], ["resumeVersion", "userId"], ["resumeTemplatePreference", "userId"], ["resumeAtsAssessment", "userId"], ["resumeRoleRecommendation", "userId"], ["careerProfile", "userId"], ["careerAssessment", "userId"], ["careerRecommendation", "userId"], ["careerActionPlan", "userId"], ["careerActionTask", "userId"], ["careerCoachConversation", "userId"], ["careerProgressSnapshot", "userId"], ["gamificationProfile", "userId"], ["pointTransaction", "userId"], ["userAchievement", "userId"], ["userGoal", "userId"], ["activityEvent", "userId"], ["progressReport", "userId"], ["userNotification", "userId"], ["savedJob", "userId"], ["jobSearchPreference", "userId"], ["jobMatchReport", "userId"], ["jobAlert", "userId"], ["applicationChecklistItem", "userId"], ["coverLetter", "userId"], ["applicationDocument", "userId"], ["applicationActivity", "userId"], ["applicationReminder", "userId"], ["applicationInterview", "userId"], ["externalIntegration", "userId"], ["pendingAuthorization", "userId"], ["integrationSyncLog", "userId"], ["externalCalendarEvent", "userId"], ["externalFileExport", "userId"], ["automationRule", "userId"], ["automationExecution", "userId"], ["emailDelivery", "userId"], ["userOnboarding", "userId"]] },
  resume: { setNull: [["analysis", "resumeId"], ["jobApplication", "resumeId"], ["resumeVersion", "resumeId"]] },
  jobDescription: { cascade: [["savedJob", "jobDescriptionId"], ["jobMatchReport", "jobDescriptionId"]], setNull: [["analysis", "jobDescriptionId"], ["jobApplication", "jobDescriptionId"], ["resumeVersion", "jobDescriptionId"], ["resumeAtsAssessment", "jobDescriptionId"]] },
  analysis: { setNull: [["jobApplication", "analysisId"]] },
  jobApplication: { cascade: [["applicationChecklistItem", "applicationId"], ["coverLetter", "applicationId"], ["applicationDocument", "applicationId"], ["applicationActivity", "applicationId"], ["applicationReminder", "applicationId"], ["applicationInterview", "applicationId"]], setNull: [["savedJob", "applicationId"]] },
  applicationChecklistItem: {},
  coverLetter: { setNull: [["applicationDocument", "coverLetterId"]] },
  applicationDocument: {},
  applicationActivity: {},
  applicationReminder: {},
  applicationInterview: { setNull: [["applicationReminder", "interviewId"]] },
  externalIntegration: { cascade: [["integrationSyncLog", "integrationId"], ["externalCalendarEvent", "integrationId"], ["externalFileExport", "integrationId"]] },
  pendingAuthorization: {},
  integrationSyncLog: {},
  externalCalendarEvent: {},
  externalFileExport: {},
  automationRule: { cascade: [["automationExecution", "ruleId"]] },
  automationExecution: {},
  emailDelivery: {},
  interviewSession: { cascade: [["interviewQuestion", "sessionId"], ["interviewAnswer", "sessionId"]] },
  interviewQuestion: { cascade: [["interviewAnswer", "questionId"]] },
  interviewAnswer: {},
  learningRoadmap: { cascade: [["roadmapMilestone", "roadmapId"]], setNull: [["skillGap", "roadmapId"]] },
  roadmapMilestone: { cascade: [["learningTask", "milestoneId"]] },
  learningTask: { cascade: [["learningResource", "taskId"]] },
  learningResource: {},
  skillGap: {},
  recommendationDismissal: {},
  resumeVersion: { cascade: [["resumeImprovement", "versionId"], ["resumeAtsAssessment", "versionId"], ["resumeRoleRecommendation", "versionId"], ["jobMatchReport", "resumeVersionId"]] },
  resumeImprovement: {},
  resumeAtsAssessment: {},
  resumeRoleRecommendation: {},
  resumeTemplatePreference: {},
  careerProfile: {},
  careerAssessment: { setNull: [["careerRecommendation", "assessmentId"]] },
  careerRecommendation: {},
  careerActionPlan: { cascade: [["careerActionTask", "planId"]] },
  careerActionTask: {},
  careerCoachConversation: { cascade: [["careerCoachMessage", "conversationId"]] },
  careerCoachMessage: {},
  careerProgressSnapshot: {}, gamificationProfile: {}, pointTransaction: {}, userAchievement: {}, userGoal: {}, activityEvent: {}, progressReport: {}, userNotification: {},
};

const DEFAULTS = {
  user: () => ({ name: null }),
  userOnboarding: () => ({ currentStep: "profile", completedSteps: [], skippedSteps: [], completedAt: null, dismissedAt: null, startedAt: new Date() }),
  resume: () => ({ targetRole: null, storageKey: null }),
  jobDescription: () => ({ companyName: null, sourceUrl: null, extractedRequirements: null }),
  analysis: () => ({ analysisMode: "ai", resumeId: null, jobDescriptionId: null, companyName: null, fileName: null, provider: null, model: null, resumeText: null }),
  jobApplication: () => ({ outcome: null, applicationDeadline: null, status: "INTERESTED", applicationDate: new Date(), jobUrl: null, nextFollowUpDate: null, notes: null, jobDescriptionId: null, resumeId: null, analysisId: null }),
  interviewSession: () => ({ interviewType: "mixed", difficulty: "intermediate", durationMinutes: null, completedQuestionCount: 0, score: null, durationSeconds: null, status: "in_progress", scoringRubricVersion: null, analysisId: null, resumeId: null, jobDescriptionId: null, topics: null, source: "mock_interview", startedAt: new Date(), completedAt: null }),
  interviewQuestion: () => ({ suggestedTimeSeconds: 180 }),
  interviewAnswer: () => ({ programmingLanguage: null, status: "draft", evaluationResult: null, score: null, rubricVersion: null, submittedAt: null, evaluatedAt: null }),
  learningRoadmap: () => ({ preferredSchedule: "flexible", preferredFormat: "mixed", targetCompletionDate: null, estimatedHours: 0, estimatedWeeks: 0, status: "active", version: 1, previousVersionId: null, changeSummary: null, skillGapSummary: null, sourceResumeId: null, sourceJobDescriptionId: null, sourceAnalysisId: null, sourceInterviewSessionIds: null, provider: null, model: null }),
  roadmapMilestone: () => ({ estimatedHours: 0, prerequisiteSequences: [], status: "not_started", completedAt: null }),
  learningTask: () => ({ difficulty: "intermediate", estimatedMinutes: 60, isRequired: true, scheduledDate: null, status: "not_started", notes: null, actualStudyMinutes: 0, checkpoint: null, checkpointAttempts: null, startedAt: null, completedAt: null }),
  learningResource: () => ({ url: null, urlVerified: false, provider: "search", description: "", difficulty: "intermediate" }),
  skillGap: () => ({ roadmapId: null, proficiencyStatus: "not_assessed", priority: "medium", priorityScore: 0, evidenceSources: [], explanation: "", whyItMatters: "", targetProficiency: "working", relatedTopics: null, userConfirmed: false, userNote: null, lastAssessedAt: null }),
  recommendationDismissal: () => ({}),
  resumeVersion: () => ({ resumeId: null, jobDescriptionId: null, parentVersionId: null, kind: "custom", isOriginal: false, templateId: "modern", contentSource: "manual", targetJobTitle: null, targetCompany: null, lastQualityScore: null }),
  resumeImprovement: () => ({ entryId: null, needsConfirmation: false, confirmationQuestion: null, status: "pending", acceptedText: null, resolvedAt: null, suggestionGroup: null, priority: "medium", title: null, issue: null, benefit: null, regenerationCount: 0 }),
  resumeAtsAssessment: () => ({ jobDescriptionId: null, jobTitle: null, targetRole: null, templateId: null, keywordCoverage: null, skills: null }),
  resumeRoleRecommendation: () => ({ careerLevel: null, selectedRole: null }),
  resumeTemplatePreference: () => ({ templateId: "modern" }),
  careerProfile: () => ({ careerLevel: "fresher", workMode: "any", salaryMin: null, salaryMax: null, salaryCurrency: null, goals: null }),
  careerAssessment: () => ({}),
  careerRecommendation: () => ({ assessmentId: null, priority: "medium", effortMinutes: null, status: "open", completedAt: null }),
  careerActionPlan: () => ({ status: "active", targetRole: null, generatedAt: new Date() }),
  careerActionTask: () => ({ description: null, href: null, estimatedMinutes: 30, dueDate: null, isOptional: false, sourceKey: null, status: "pending", completedAt: null, notes: null }),
  careerCoachConversation: () => ({ title: "New conversation" }),
  careerCoachMessage: () => ({ factsUsed: null, suggestions: null, links: null, clarifying: false, provider: null, model: null }),
  careerProgressSnapshot: () => ({ overallScore: null }),
  gamificationProfile: () => ({ totalPoints: 0, level: 1, timezone: "UTC", currentStreak: 0, longestStreak: 0, lastActivityDay: null, notificationPreferences: null, lastReconciledAt: null }),
  pointTransaction: () => ({ cycle: 1, sourceType: null, sourceId: null }),
  userAchievement: () => ({ unlockedAt: new Date(), evidence: null }),
  userGoal: () => ({ description: null, linkKey: null, baselineValue: 0, currentValue: 0, unit: "count", targetDate: null, status: "active", completedAt: null }),
  activityEvent: () => ({ points: 0, href: null, metadata: null }),
  progressReport: () => ({ narrative: null, aiUsed: false, provider: null, model: null }),
  userNotification: () => ({ href: null, readAt: null }),
  // ── Phase 12 ──
  jobProvider: () => ({ attribution: null, termsUrl: null, lastFetchedAt: null, lastStatus: null, lastError: null, lastJobCount: 0, requestCount: 0 }),
  externalJob: () => ({
    companyLogoUrl: null, location: null, isRemote: false, workArrangement: "unknown", employmentType: "unknown",
    experienceLevel: "unknown", salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null,
    salaryIsEstimate: false, isSponsored: false, postedAt: null, postedAtReliable: false, sourceUrl: null,
    applyUrl: null, tags: null, listingStatus: "open", fetchedAt: new Date(), lastCheckedAt: new Date(),
  }),
  savedJob: () => ({ externalJobId: null, jobDescriptionId: null, state: "saved", notes: null, applicationId: null }),
  jobSearchPreference: () => ({ titles: [], skills: [], locations: [], workArrangements: [], employmentTypes: [], experienceLevel: null, minSalary: null, salaryCurrency: null, excludedCompanies: [], keywords: null, rankingWeights: null }),
  jobMatchReport: () => ({ externalJobId: null, jobDescriptionId: null }),
  jobAlert: () => ({ frequency: "manual", isActive: true, lastRunAt: null, lastResultCount: 0, lastNewCount: 0 }),
  // ── Phase 13 ──
  applicationChecklistItem: () => ({ key: null, description: null, isRequired: true, isCustom: false, completionSource: null, sortOrder: 0, completedAt: null }),
  coverLetter: () => ({ resumeVersionId: null, jobDescriptionId: null, tone: "professional", lengthTarget: "standard", versionNumber: 1, status: "draft", source: "ai", provider: null, model: null, groundingNotes: null, wordCount: 0 }),
  applicationDocument: () => ({ kind: "file", fileName: null, mimeType: null, fileSize: null, storageKey: null, url: null, checksum: null, coverLetterId: null, note: null }),
  applicationActivity: () => ({ detail: null, source: "system", fromStatus: null, toStatus: null, dedupeKey: null, occurredAt: new Date() }),
  applicationReminder: () => ({ applicationId: null, interviewId: null, note: null, timezone: "UTC", status: "pending", completedAt: null, dedupeKey: null }),
  // ── Phase 14 ──
  externalIntegration: () => ({ status: "disconnected", credentials: null, hasRefreshToken: false, scopes: [], expiresAt: null, connectedAt: null, lastSyncAt: null, lastError: null, externalAccountLabel: null, preferences: {} }),
  pendingAuthorization: () => ({ codeVerifier: null, returnTo: null }),
  integrationSyncLog: () => ({ detail: null, externalId: null }),
  externalCalendarEvent: () => ({ externalEventId: null, calendarId: "primary", contentHash: null, status: "synced", lastSyncedAt: new Date() }),
  externalFileExport: () => ({ webViewLink: null }),
  automationRule: () => ({ isEnabled: false, config: {}, lastRunAt: null, lastStatus: null }),
  automationExecution: () => ({ trigger: null, plannedActions: [], results: [], approved: false, retryOfId: null, retryCount: 0, nextRetryAt: null, errorCategory: null }),
  emailDelivery: () => ({ preview: null }),
  applicationInterview: () => ({ scheduledAt: null, timezone: null, durationMinutes: null, mode: "video", location: null, interviewers: null, preparationNotes: null, mockSessionId: null, outcome: "scheduled", feedback: null }),
};

export function fakePrisma() {
  const tables = Object.fromEntries(Object.keys(RELATIONS).map((m) => [m, []]));
  let seq = 0;
  const id = () => `c${(++seq).toString(36).padStart(24, "0")}`;

  function matchValue(actual, cond) {
    if (cond === null || typeof cond !== "object" || cond instanceof Date) return actual === cond || (actual instanceof Date && cond instanceof Date && actual.getTime() === cond.getTime());
    return Object.entries(cond).every(([op, v]) => {
      const a = actual instanceof Date ? actual.getTime() : actual;
      const b = v instanceof Date ? v.getTime() : v;
      switch (op) {
        // `mode: "insensitive"` applies to equals and the string operators,
        // exactly as PostgreSQL does. Without this the double silently matched
        // case-sensitively while the real database did not, which would make a
        // passing test mean nothing.
        case "equals":
          if (cond.mode === "insensitive" && typeof actual === "string" && typeof v === "string") {
            return actual.toLowerCase() === v.toLowerCase();
          }
          return a === b;
        case "startsWith": return typeof actual === "string" && (cond.mode === "insensitive" ? actual.toLowerCase().startsWith(String(v).toLowerCase()) : actual.startsWith(v));
        case "endsWith": return typeof actual === "string" && (cond.mode === "insensitive" ? actual.toLowerCase().endsWith(String(v).toLowerCase()) : actual.endsWith(v));
        case "in": return Array.isArray(v) && v.includes(actual);
        case "notIn": return Array.isArray(v) && !v.includes(actual);
        case "not": return a !== b;
        case "gte": return a !== null && a !== undefined && a >= b;
        case "lte": return a !== null && a !== undefined && a <= b;
        case "gt": return a !== null && a !== undefined && a > b;
        case "lt": return a !== null && a !== undefined && a < b;
        case "contains": return typeof actual === "string" && (cond.mode === "insensitive" ? actual.toLowerCase().includes(String(v).toLowerCase()) : actual.includes(v));
        case "mode": return true;
        default: throw new Error(`fakePrisma: unsupported operator ${op}`);
      }
    });
  }

  function matches(model, row, where = {}) {
    return Object.entries(where).every(([k, v]) => {
      if (k === "OR") return v.some((w) => matches(model, row, w));
      if (k === "AND") return v.every((w) => matches(model, row, w));
      if (k === "NOT") return Array.isArray(v) ? !v.some((w) => matches(model, row, w)) : !matches(model, row, v);
      const rel = RELATIONS[model]?.[k];
      if (rel && rel.kind === "one") {
        const target = rel.reverse ? tables[rel.model].find((r) => r[rel.foreignKey] === row.id) : tables[rel.model].find((r) => r.id === row[rel.localKey]);
        return target ? matches(rel.model, target, v) : false;
      }
      return matchValue(row[k], v);
    });
  }

  function orderRows(rows, orderBy) {
    if (!orderBy) return rows;
    const specs = Array.isArray(orderBy) ? orderBy : [orderBy];
    return [...rows].sort((a, b) => {
      for (const spec of specs) {
        const [field, dir] = Object.entries(spec)[0];
        let x = a[field], y = b[field];
        if (x instanceof Date) x = x.getTime();
        if (y instanceof Date) y = y.getTime();
        if (x === y) continue;
        if (x === null || x === undefined) return 1;
        if (y === null || y === undefined) return -1;
        const cmp = x < y ? -1 : 1;
        return dir === "desc" ? -cmp : cmp;
      }
      return 0;
    });
  }

  function resolveRelation(model, row, field, spec) {
    const rel = RELATIONS[model][field];
    if (!rel) throw new Error(`fakePrisma: unknown relation ${model}.${field}`);
    if (rel.kind === "one") {
      const target = rel.reverse ? tables[rel.model].find((r) => r[rel.foreignKey] === row.id) : tables[rel.model].find((r) => r.id === row[rel.localKey]);
      return target ? project(rel.model, target, spec === true ? {} : spec) : null;
    }
    let rows = tables[rel.model].filter((r) => r[rel.foreignKey] === row.id);
    const opts = spec === true ? {} : spec;
    rows = orderRows(rows.filter((r) => matches(rel.model, r, opts.where)), opts.orderBy);
    if (opts.take !== undefined) rows = rows.slice(0, opts.take);
    return rows.map((r) => project(rel.model, r, opts));
  }

  function project(model, row, { select, include } = {}) {
    if (!select && !include) return { ...row };
    const out = select ? {} : { ...row };
    const spec = select ?? include;
    for (const [field, value] of Object.entries(spec)) {
      if (!value) continue;
      if (field === "_count") {
        out._count = Object.fromEntries(Object.keys(value.select).map((relField) => [relField, resolveRelation(model, row, relField, true).length]));
      } else if (RELATIONS[model]?.[field]) {
        out[field] = resolveRelation(model, row, field, value);
      } else if (select) {
        out[field] = row[field];
      }
    }
    return out;
  }

  function cascadeDelete(model, row) {
    for (const [childModel, fk] of ON_DELETE[model]?.cascade ?? []) {
      for (const child of tables[childModel].filter((r) => r[fk] === row.id)) cascadeDelete(childModel, child);
      tables[childModel] = tables[childModel].filter((r) => r[fk] !== row.id);
    }
    for (const [childModel, fk] of ON_DELETE[model]?.setNull ?? []) {
      for (const child of tables[childModel]) if (child[fk] === row.id) child[fk] = null;
    }
    tables[model] = tables[model].filter((r) => r.id !== row.id);
  }

  function delegate(model) {
    return {
      async create({ data, include, select }) {
        const row = { id: id(), createdAt: new Date(), updatedAt: new Date(), ...DEFAULTS[model](), ...data };
        tables[model].push(row);
        return project(model, row, { include, select });
      },
      async createMany({ data }) {
        const rows = Array.isArray(data) ? data : [data];
        for (const d of rows) tables[model].push({ id: id(), createdAt: new Date(), updatedAt: new Date(), ...DEFAULTS[model](), ...d });
        return { count: rows.length };
      },
      async findFirst({ where, include, select, orderBy } = {}) {
        const rows = orderRows(tables[model].filter((r) => matches(model, r, where)), orderBy);
        return rows[0] ? project(model, rows[0], { include, select }) : null;
      },
      async findUnique({ where, include, select }) {
        const row = tables[model].find((r) => matches(model, r, where));
        return row ? project(model, row, { include, select }) : null;
      },
      async findMany({ where, orderBy, skip = 0, take, select, include } = {}) {
        let rows = orderRows(tables[model].filter((r) => matches(model, r, where)), orderBy);
        rows = rows.slice(skip, take !== undefined ? skip + take : undefined);
        return rows.map((r) => project(model, r, { select, include }));
      },
      async count({ where } = {}) {
        return tables[model].filter((r) => matches(model, r, where)).length;
      },
      async update({ where, data, include, select }) {
        const row = tables[model].find((r) => matches(model, r, where));
        if (!row) throw Object.assign(new Error("Record not found"), { code: "P2025" });
        Object.assign(row, data, { updatedAt: new Date() });
        return project(model, row, { include, select });
      },
      async updateMany({ where, data }) {
        let count = 0;
        for (const r of tables[model]) if (matches(model, r, where)) { Object.assign(r, data, { updatedAt: new Date() }); count++; }
        return { count };
      },
      /**
       * Update the row the unique `where` names, or create it.
       *
       * Scalar unique fields work directly, because `where` is matched the same
       * way every other query is. A compound unique key arrives as a single
       * nested object (`{ userId_key: { userId, key } }`), so it is flattened
       * back into ordinary field matching first.
       */
      async upsert({ where, create, update, include, select }) {
        const flat = {};
        for (const [k, v] of Object.entries(where)) {
          if (v && typeof v === "object" && !(v instanceof Date) && !Array.isArray(v) && k.includes("_")) {
            Object.assign(flat, v);
          } else {
            flat[k] = v;
          }
        }
        const row = tables[model].find((r) => matches(model, r, flat));
        if (row) {
          Object.assign(row, update, { updatedAt: new Date() });
          return project(model, row, { include, select });
        }
        const fresh = { id: id(), createdAt: new Date(), updatedAt: new Date(), ...DEFAULTS[model](), ...create };
        tables[model].push(fresh);
        return project(model, fresh, { include, select });
      },
      async delete({ where }) {
        const row = tables[model].find((r) => matches(model, r, where));
        if (!row) throw Object.assign(new Error("Record not found"), { code: "P2025" });
        cascadeDelete(model, row);
        return row;
      },
      async deleteMany({ where }) {
        const victims = tables[model].filter((r) => matches(model, r, where));
        for (const v of victims) cascadeDelete(model, v);
        return { count: victims.length };
      },
    };
  }

  const client = {
    tables,
    get users() { return tables.user; },
    get analyses() { return tables.analysis; },
    async $transaction(arg) {
      return typeof arg === "function" ? arg(client) : Promise.all(arg);
    },
    /**
     * The readiness probe's `SELECT 1`. Set `client.dbDown = true` to make the
     * database look unavailable, which is the only way to test that readiness
     * actually fails when it should.
     */
    dbDown: false,
    async $queryRaw() {
      if (client.dbDown) {
        const err = new Error("Can't reach database server");
        err.code = "P1001";
        throw err;
      }
      return [{ "?column?": 1 }];
    },
  };
  for (const model of Object.keys(RELATIONS)) client[model] = delegate(model);
  return client;
}

export const TEST_ENV = {
  NODE_ENV: "test",
  PORT: "0",
  FRONTEND_URL: "http://localhost:3001",
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  JWT_SECRET: "test-secret-test-secret-test-secret-123456",
  LLM_PROVIDER: "anthropic",
  LLM_API_KEY: "fake-key",
  ANALYSIS_RATE_LIMIT: "100",
  AUTH_RATE_LIMIT: "500",
  // Phase 12: no provider is enabled by default, so tests opt in explicitly.
  JOB_PROVIDERS: "",
  JOB_PROVIDER_TIMEOUT_MS: "2000",
  JOB_CACHE_TTL_MINUTES: "30",
  JOB_RETENTION_DAYS: "30",
  JOB_PROVIDER_RATE_LIMIT_PER_MIN: "20",
  // Phase 14: a real 32-byte key so the vault works in tests; no provider
  // credentials, so the integrations stay honestly "needs setup" by default.
  APP_BASE_URL: "http://localhost:4000",
  INTEGRATION_ENCRYPTION_KEY: "dGVzdC1rZXktMzItYnl0ZXMtZm9yLXZhdWx0LXRlc3Q=",
  EMAIL_TRANSPORT: "log",
  // Phase 15: the operator-only health detail route is reachable in tests.
  HEALTH_TOKEN: "test-health-token",
};
