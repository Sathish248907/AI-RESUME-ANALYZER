/**
 * mockAnalysisService.ts
 * Generates demo analysis results for frontend development.
 * ALL results from this service are clearly labelled as demo/illustrative.
 * Demo findings are NOT derived from the actual uploaded resume content.
 */

export type TargetRole =
  | "Frontend Developer"
  | "Backend Developer"
  | "Full Stack Developer"
  | "Data Analyst"
  | "Software Engineer";

export interface SkillItem {
  name: string;
  category: "technical" | "soft" | "tool" | "framework" | string;
  matchType: "matched" | "partial" | "missing";
  // ── Optional fields populated by real AI analyses (Phase 4) ──
  /** Resume text supporting the match. */
  evidence?: string;
  evidenceType?: "direct" | "inferred";
  /** For missing/unverified skills: why it could not be confirmed. */
  reason?: string;
  /** What is weaker than the job asks for (partial matches). */
  gap?: string;
  priority?: "required" | "preferred" | "unknown";
}

export interface ATSCheck {
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  /** text = verified from extracted text; heuristic = estimate; requires-original = needs the original file. */
  verifiability?: "text" | "heuristic" | "requires-original";
}

export interface RecommendationItem {
  type: "keyword" | "achievement" | "project" | "structure" | "general";
  priority: "high" | "medium" | "low";
  title: string;
  description: string;
}

export interface InterviewQuestion {
  question: string;
  type: "technical" | "behavioral" | "resume-based";
  difficulty: "easy" | "medium" | "hard";
  /** Why this question was generated (AI analyses only). */
  reason?: string;
}

export interface AlignmentSummary {
  resumeEvidence: string[];
  jobRequirements: string[];
  assessment: string;
  meetsRequirement: "yes" | "partial" | "no" | "unknown";
}

export interface ScoreBreakdownItem {
  key: string;
  label: string;
  weight: number;
  ratio: number;
  contribution: number;
}

export interface MockAnalysisResult {
  id: string;
  isDemoData: true; // always true — never remove this flag
  createdAt: string;
  jobTitle: string;
  targetRole: TargetRole;
  jobDescription: string;
  fileName: string;
  matchScore: number;
  matchExplanation: string;
  skills: SkillItem[];
  atsChecks: ATSCheck[];
  strengths: string[];
  recommendations: RecommendationItem[];
  interviewQuestions: InterviewQuestion[];
}

/**
 * AnalysisView — what the results UI renders. Demo results (MockAnalysisResult)
 * are assignable to it; real AI analyses fill in the optional fields.
 */
export type AnalysisView = Omit<MockAnalysisResult, "isDemoData" | "targetRole"> & {
  isDemoData: boolean;
  analysisMode: "demo" | "ai";
  targetRole: string;
  companyName?: string | null;
  summary?: string;
  /** Null when the backend reported insufficient evidence. */
  scoreAvailable?: boolean;
  lowEvidence?: boolean;
  scoreBreakdown?: ScoreBreakdownItem[];
  experienceAlignment?: AlignmentSummary;
  educationAlignment?: AlignmentSummary;
  keywordAnalysis?: { foundKeywords: string[]; missingOrUnverifiedKeywords: string[]; recommendedKeywords: string[] };
  limitations?: string[];
  provider?: string | null;
  model?: string | null;
  canRegenerate?: boolean;
  updatedAt?: string;
};

export function toAnalysisView(result: MockAnalysisResult): AnalysisView {
  return { ...result, analysisMode: "demo", scoreAvailable: true };
}

// ─── Role-specific skill sets ──────────────────────────────────────────────

const ROLE_DATA: Record<
  TargetRole,
  {
    matched: string[];
    partial: string[];
    missing: string[];
    score: number;
    strengths: string[];
  }
> = {
  "Frontend Developer": {
    matched: ["React", "JavaScript", "HTML", "CSS", "Git"],
    partial: ["TypeScript", "Responsive Design", "REST APIs"],
    missing: ["Next.js", "Jest", "Cypress", "Storybook"],
    score: 72,
    strengths: [
      "Solid React component development experience",
      "Strong HTML/CSS fundamentals and responsive layouts",
      "Version control with Git",
      "Experience consuming REST APIs",
    ],
  },
  "Backend Developer": {
    matched: ["Node.js", "Express.js", "SQL", "REST APIs", "Git"],
    partial: ["PostgreSQL", "Authentication", "Docker"],
    missing: ["Microservices", "Redis", "GraphQL", "Kubernetes"],
    score: 68,
    strengths: [
      "Server-side JavaScript with Node.js and Express",
      "Relational database design and SQL queries",
      "RESTful API design principles",
      "Authentication and authorisation experience",
    ],
  },
  "Full Stack Developer": {
    matched: ["React", "Node.js", "JavaScript", "SQL", "Git"],
    partial: ["TypeScript", "Docker", "CI/CD", "Testing"],
    missing: ["AWS/Cloud", "GraphQL", "Redis", "Kubernetes"],
    score: 75,
    strengths: [
      "End-to-end feature development across frontend and backend",
      "React UI development with Node.js APIs",
      "Database design and integration",
      "Collaborative development with version control",
    ],
  },
  "Data Analyst": {
    matched: ["Python", "SQL", "Excel", "Data Visualization", "Statistics"],
    partial: ["Pandas", "Tableau", "Power BI"],
    missing: ["Machine Learning", "R", "Apache Spark", "dbt"],
    score: 70,
    strengths: [
      "Data wrangling and transformation with Python",
      "SQL query writing for large datasets",
      "Statistical analysis and reporting",
      "Dashboard creation and data storytelling",
    ],
  },
  "Software Engineer": {
    matched: ["Python", "Java", "Data Structures", "Algorithms", "Git"],
    partial: ["System Design", "Testing", "CI/CD"],
    missing: ["Distributed Systems", "Kubernetes", "Cloud Platforms", "Kafka"],
    score: 73,
    strengths: [
      "Strong foundational programming skills",
      "Experience with data structures and algorithms",
      "Object-oriented design patterns",
      "Collaborative development in a team environment",
    ],
  },
};

const ROLE_RECOMMENDATIONS: Record<TargetRole, RecommendationItem[]> = {
  "Frontend Developer": [
    { type: "keyword", priority: "high", title: "Add TypeScript", description: "TypeScript appears in 80%+ of frontend job postings. Add type definitions to your existing React projects." },
    { type: "achievement", priority: "high", title: "Quantify impact", description: "Replace 'built responsive UI' with specific metrics, e.g. 'reduced page load time by 35% through code splitting'." },
    { type: "project", priority: "medium", title: "Showcase a full project", description: "Add a project that demonstrates routing, state management, and API integration together." },
    { type: "keyword", priority: "medium", title: "Mention testing", description: "Add any experience with Jest, React Testing Library, or Cypress — even basic unit tests stand out." },
    { type: "structure", priority: "low", title: "Lead with a summary", description: "A 2–3 sentence professional summary at the top helps ATS systems classify your profile correctly." },
  ],
  "Backend Developer": [
    { type: "keyword", priority: "high", title: "Highlight API design", description: "Explicitly mention RESTful API design, HTTP methods, and any experience with API documentation tools like Swagger." },
    { type: "achievement", priority: "high", title: "Add performance metrics", description: "Quantify backend work, e.g. 'handled 10k concurrent connections' or 'reduced query time by 60%'." },
    { type: "keyword", priority: "medium", title: "Mention containerisation", description: "Even basic Docker knowledge is a strong signal for backend roles — add it if applicable." },
    { type: "project", priority: "medium", title: "Include a backend project", description: "Show a project with auth, database integration, and error handling — not just 'Hello World' APIs." },
    { type: "structure", priority: "low", title: "Separate skills by category", description: "Group skills into Languages, Frameworks, Databases, and Tools for better ATS parsing." },
  ],
  "Full Stack Developer": [
    { type: "keyword", priority: "high", title: "Show both sides", description: "Explicitly list frontend AND backend skills separately. Many ATS systems score each side independently." },
    { type: "achievement", priority: "high", title: "End-to-end project metrics", description: "Describe full-stack projects with user impact: 'built a platform used by 500+ users' is stronger than 'built a web app'." },
    { type: "keyword", priority: "medium", title: "Add cloud experience", description: "Mention any AWS, GCP, or Vercel deployments — full stack roles usually include deployment responsibility." },
    { type: "project", priority: "medium", title: "Link GitHub or live demo", description: "Full stack roles almost always expect to see code — link your best project repository." },
    { type: "structure", priority: "low", title: "List DevOps basics", description: "Mention CI/CD pipelines, environment management, or basic bash scripting if you have that experience." },
  ],
  "Data Analyst": [
    { type: "keyword", priority: "high", title: "Add tools explicitly", description: "List Tableau, Power BI, or Looker explicitly — data analyst roles are often screened by tool name." },
    { type: "achievement", priority: "high", title: "Quantify business impact", description: "Replace 'analysed data' with 'identified trends that reduced churn by 12%' — outcome-driven descriptions matter." },
    { type: "keyword", priority: "medium", title: "Mention SQL proficiency level", description: "State whether you write basic queries or complex window functions, CTEs, and stored procedures." },
    { type: "project", priority: "medium", title: "Include a data project", description: "Add a portfolio project with a publicly viewable dashboard or Jupyter notebook." },
    { type: "structure", priority: "low", title: "Highlight communication skills", description: "Data analyst roles heavily weight the ability to present findings — mention presentations or stakeholder reports." },
  ],
  "Software Engineer": [
    { type: "keyword", priority: "high", title: "Mention system design", description: "Even if entry-level, referencing scalability concerns or architectural decisions signals engineering maturity." },
    { type: "achievement", priority: "high", title: "Show impact in teams", description: "Mention code reviews, mentoring, or cross-team collaboration — software engineering is a team sport." },
    { type: "keyword", priority: "medium", title: "Add testing experience", description: "Unit, integration, and end-to-end testing experience is expected at most SWE roles." },
    { type: "project", priority: "medium", title: "Open source or side projects", description: "Contributions to open source or personal projects with public code are a strong differentiator." },
    { type: "structure", priority: "low", title: "Use action verbs consistently", description: "Start every bullet with a strong action verb: Designed, Implemented, Optimised, Refactored." },
  ],
};

const BASE_ATS_CHECKS: ATSCheck[] = [
  { label: "Contact Information", status: "pass", detail: "Name, email, and phone number format detected in standard positions." },
  { label: "Section Structure", status: "pass", detail: "Common resume sections (Experience, Education, Skills) appear to be present." },
  { label: "File Format", status: "pass", detail: "PDF and DOCX formats are generally ATS-compatible. Avoid multi-column layouts." },
  { label: "Keyword Coverage", status: "warn", detail: "Several job-description keywords are not present in the detected resume text. See Missing Skills for specifics." },
  { label: "Readability", status: "warn", detail: "Avoid tables, text boxes, and headers/footers — some ATS systems cannot parse these." },
  { label: "Date Formatting", status: "pass", detail: "Month-year date ranges (e.g. Jan 2022 – Mar 2024) are typically ATS-compatible." },
  { label: "Special Characters", status: "warn", detail: "Avoid decorative bullets, custom fonts, and symbols that may not render in all ATS platforms." },
];

const BASE_INTERVIEW_QUESTIONS: Record<TargetRole, InterviewQuestion[]> = {
  "Frontend Developer": [
    { question: "Explain the difference between controlled and uncontrolled components in React.", type: "technical", difficulty: "medium" },
    { question: "How does the browser render a webpage? Walk through the critical rendering path.", type: "technical", difficulty: "hard" },
    { question: "Describe a time you improved performance on a web application.", type: "behavioral", difficulty: "medium" },
    { question: "What accessibility standards do you follow when building UI components?", type: "technical", difficulty: "medium" },
    { question: "Walk me through a project you're proud of. What decisions did you make?", type: "resume-based", difficulty: "easy" },
    { question: "How would you approach optimising a React app that's slow to render?", type: "technical", difficulty: "hard" },
    { question: "Describe a situation where you had to work with a difficult design requirement.", type: "behavioral", difficulty: "easy" },
  ],
  "Backend Developer": [
    { question: "How would you design a rate-limiting system for a public API?", type: "technical", difficulty: "hard" },
    { question: "Explain the difference between SQL JOINs: INNER, LEFT, RIGHT, and FULL OUTER.", type: "technical", difficulty: "medium" },
    { question: "Describe a time you debugged a production issue under pressure.", type: "behavioral", difficulty: "medium" },
    { question: "How do you handle authentication and session management in your Node.js projects?", type: "resume-based", difficulty: "medium" },
    { question: "What strategies do you use to prevent SQL injection?", type: "technical", difficulty: "easy" },
    { question: "How would you approach database schema design for a multi-tenant SaaS?", type: "technical", difficulty: "hard" },
    { question: "Tell me about a time you had to refactor a messy codebase.", type: "behavioral", difficulty: "medium" },
  ],
  "Full Stack Developer": [
    { question: "How do you decide what logic belongs in the frontend vs the backend?", type: "technical", difficulty: "medium" },
    { question: "Explain how you would implement real-time features (e.g. notifications) in a web app.", type: "technical", difficulty: "hard" },
    { question: "Walk me through the architecture of a full-stack project you built.", type: "resume-based", difficulty: "medium" },
    { question: "How do you handle CORS, authentication, and session management across your stack?", type: "technical", difficulty: "medium" },
    { question: "Describe a time when frontend and backend requirements conflicted. How did you resolve it?", type: "behavioral", difficulty: "medium" },
    { question: "What is your approach to testing full-stack applications?", type: "technical", difficulty: "medium" },
    { question: "How do you deploy and monitor a full-stack application?", type: "technical", difficulty: "hard" },
  ],
  "Data Analyst": [
    { question: "How would you handle missing or inconsistent data in a large dataset?", type: "technical", difficulty: "medium" },
    { question: "Explain the difference between inner join and left join in SQL.", type: "technical", difficulty: "easy" },
    { question: "Describe a time you presented a complex finding to a non-technical audience.", type: "behavioral", difficulty: "medium" },
    { question: "Walk me through a data project you completed end-to-end.", type: "resume-based", difficulty: "medium" },
    { question: "How would you detect and handle outliers in a dataset?", type: "technical", difficulty: "medium" },
    { question: "What's the difference between a cohort analysis and a funnel analysis?", type: "technical", difficulty: "hard" },
    { question: "How do you prioritise which metrics to track for a business?", type: "behavioral", difficulty: "hard" },
  ],
  "Software Engineer": [
    { question: "Explain time and space complexity. Give an example of optimising an O(n²) algorithm.", type: "technical", difficulty: "hard" },
    { question: "How would you design a URL shortener like bit.ly?", type: "technical", difficulty: "hard" },
    { question: "Describe the software engineering principles you apply to everyday coding.", type: "behavioral", difficulty: "medium" },
    { question: "Walk me through a technically challenging project you built or contributed to.", type: "resume-based", difficulty: "medium" },
    { question: "What is the difference between a process and a thread?", type: "technical", difficulty: "medium" },
    { question: "How do you approach writing testable code?", type: "technical", difficulty: "medium" },
    { question: "Tell me about a time you disagreed with a technical decision. What did you do?", type: "behavioral", difficulty: "medium" },
  ],
};

// ─── Generator ─────────────────────────────────────────────────────────────

function generateId(): string {
  return `demo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function generateMockAnalysis(
  jobTitle: string,
  targetRole: TargetRole,
  jobDescription: string,
  fileName: string
): MockAnalysisResult {
  const roleData = ROLE_DATA[targetRole];

  const skills: SkillItem[] = [
    ...roleData.matched.map(
      (name): SkillItem => ({ name, category: "technical", matchType: "matched" })
    ),
    ...roleData.partial.map(
      (name): SkillItem => ({ name, category: "technical", matchType: "partial" })
    ),
    ...roleData.missing.map(
      (name): SkillItem => ({ name, category: "technical", matchType: "missing" })
    ),
  ];

  // Slightly randomise score ±5 so repeated demos don't look identical
  const jitter = Math.floor(Math.random() * 11) - 5;
  const matchScore = Math.min(95, Math.max(40, roleData.score + jitter));

  const matchExplanation =
    matchScore >= 80
      ? "Your resume shows strong alignment with this role. A few targeted additions could make it even more competitive."
      : matchScore >= 60
      ? "Your resume has a solid foundation for this role with some skill gaps to address. Focusing on the missing items below will significantly improve your match."
      : "There are meaningful gaps between your current profile and this role's requirements. The recommendations below outline the highest-priority improvements.";

  return {
    id: generateId(),
    isDemoData: true,
    createdAt: new Date().toISOString(),
    jobTitle,
    targetRole,
    jobDescription,
    fileName,
    matchScore,
    matchExplanation,
    skills,
    atsChecks: BASE_ATS_CHECKS,
    strengths: roleData.strengths,
    recommendations: ROLE_RECOMMENDATIONS[targetRole],
    interviewQuestions: BASE_INTERVIEW_QUESTIONS[targetRole],
  };
}

// Simulate async AI call with realistic loading phases
export type LoadingPhase =
  | "parsing"
  | "extracting"
  | "comparing"
  | "scoring"
  | "generating"
  | "done";

export const LOADING_MESSAGES: Record<LoadingPhase, string> = {
  parsing: "Parsing resume content…",
  extracting: "Extracting skills and experience…",
  comparing: "Comparing against job requirements…",
  scoring: "Calculating match score…",
  generating: "Generating recommendations…",
  done: "Analysis complete!",
};

export async function runMockAnalysis(
  jobTitle: string,
  targetRole: TargetRole,
  jobDescription: string,
  fileName: string,
  onPhase: (phase: LoadingPhase) => void
): Promise<MockAnalysisResult> {
  const phases: LoadingPhase[] = [
    "parsing",
    "extracting",
    "comparing",
    "scoring",
    "generating",
  ];
  for (const phase of phases) {
    onPhase(phase);
    await new Promise((r) => setTimeout(r, 600 + Math.random() * 400));
  }
  onPhase("done");
  await new Promise((r) => setTimeout(r, 300));
  return generateMockAnalysis(jobTitle, targetRole, jobDescription, fileName);
}
