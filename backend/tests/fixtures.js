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
      resumeEvidence: ["B.Sc. Computer Science"],
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
export function fakeLlm(behaviour = () => validAiOutput()) {
  return {
    name: "fake",
    model: "fake-model",
    calls: 0,
    async generateStructured(req) {
      this.calls += 1;
      const out = await behaviour(req);
      return { data: out, usage: { inputTokens: 1, outputTokens: 1 }, provider: "fake", model: "fake-model" };
    },
  };
}

/** Minimal in-memory stand-in for the Prisma client (users + analyses). */
export function fakePrisma() {
  const users = [];
  const analyses = [];
  let seq = 0;
  const id = () => `c${(++seq).toString(36).padStart(24, "0")}`;
  const matches = (row, where) => Object.entries(where).every(([k, v]) => row[k] === v);

  return {
    users,
    analyses,
    user: {
      async findUnique({ where }) {
        return users.find((u) => (where.id ? u.id === where.id : u.email === where.email)) ?? null;
      },
      async create({ data }) {
        const u = { id: id(), createdAt: new Date(), updatedAt: new Date(), name: null, ...data };
        users.push(u);
        return u;
      },
    },
    analysis: {
      async create({ data }) {
        const a = { id: id(), createdAt: new Date(), updatedAt: new Date(), ...data };
        analyses.push(a);
        return a;
      },
      async findFirst({ where }) {
        return analyses.find((a) => matches(a, where)) ?? null;
      },
      async findMany({ where, take, select }) {
        const rows = analyses.filter((a) => matches(a, where)).sort((x, y) => y.createdAt - x.createdAt).slice(0, take);
        if (!select) return rows;
        return rows.map((r) => Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, r[k]])));
      },
      async deleteMany({ where }) {
        const before = analyses.length;
        for (let i = analyses.length - 1; i >= 0; i--) if (matches(analyses[i], where)) analyses.splice(i, 1);
        return { count: before - analyses.length };
      },
      async updateMany({ where, data }) {
        let count = 0;
        for (const a of analyses) if (matches(a, where)) { Object.assign(a, data, { updatedAt: new Date() }); count++; }
        return { count };
      },
      async count({ where }) {
        return analyses.filter((a) => matches(a, where)).length;
      },
    },
  };
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
};
