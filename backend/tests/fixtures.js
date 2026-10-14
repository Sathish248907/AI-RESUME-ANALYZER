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
  },
};

/** onDelete behaviour: which foreign keys to null out / which rows to cascade-delete. */
const ON_DELETE = {
  user: { cascade: [["analysis", "userId"], ["resume", "userId"], ["jobDescription", "userId"], ["jobApplication", "userId"], ["interviewSession", "userId"]] },
  resume: { setNull: [["analysis", "resumeId"], ["jobApplication", "resumeId"]] },
  jobDescription: { setNull: [["analysis", "jobDescriptionId"], ["jobApplication", "jobDescriptionId"]] },
  analysis: { setNull: [["jobApplication", "analysisId"]] },
  jobApplication: {},
  interviewSession: {},
};

const DEFAULTS = {
  user: () => ({ name: null }),
  resume: () => ({ targetRole: null, storageKey: null }),
  jobDescription: () => ({ companyName: null, sourceUrl: null, extractedRequirements: null }),
  analysis: () => ({ analysisMode: "ai", resumeId: null, jobDescriptionId: null, companyName: null, fileName: null, provider: null, model: null, resumeText: null }),
  jobApplication: () => ({ status: "INTERESTED", applicationDate: new Date(), jobUrl: null, nextFollowUpDate: null, notes: null, jobDescriptionId: null, resumeId: null, analysisId: null }),
  interviewSession: () => ({ interviewType: "mixed", completedQuestionCount: 0, score: null, durationSeconds: null, status: "in_progress", analysisId: null, completedAt: null }),
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
        case "equals": return a === b;
        case "in": return Array.isArray(v) && v.includes(actual);
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
      const rel = RELATIONS[model]?.[k];
      if (rel && rel.kind === "one") {
        const target = tables[rel.model].find((r) => r.id === row[rel.localKey]);
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
      const target = tables[rel.model].find((r) => r.id === row[rel.localKey]);
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
};
