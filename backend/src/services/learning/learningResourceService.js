/**
 * learningResourceService.js — verified learning resource catalog.
 *
 * URLs are only ever taken from this hand-maintained catalog of official
 * documentation and well-known platforms; nothing is fetched or invented.
 * Entries flagged `provider: "third_party"` are labelled as such in the UI and
 * no claims are made about pricing. When a skill is not in the catalog the
 * service returns a `search_suggestion` entry with no URL.
 */

const OFFICIAL = (title, url, description, level = "beginner") => ({ title, resourceType: "official_docs", url, urlVerified: true, provider: "official", description, difficulty: level });
const THIRD = (title, url, resourceType, description, level = "beginner") => ({ title, resourceType, url, urlVerified: true, provider: "third_party", description, difficulty: level });

/** Keyed by lower-cased skill name; aliases map to the same list. */
const CATALOG = {
  javascript: [
    OFFICIAL("MDN — JavaScript Guide", "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide", "The reference guide for language fundamentals through advanced topics."),
    OFFICIAL("MDN — Asynchronous JavaScript", "https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Asynchronous", "Promises, async/await, timers and the event loop.", "intermediate"),
    THIRD("javascript.info — The Modern JavaScript Tutorial", "https://javascript.info/", "tutorial", "Long-form tutorial from basics to advanced browser topics."),
  ],
  typescript: [
    OFFICIAL("TypeScript Handbook", "https://www.typescriptlang.org/docs/handbook/intro.html", "Official handbook covering types, generics, narrowing and modules."),
    OFFICIAL("TypeScript Playground", "https://www.typescriptlang.org/play", "Experiment with types in the browser.", "beginner"),
  ],
  html: [OFFICIAL("MDN — HTML", "https://developer.mozilla.org/en-US/docs/Learn/HTML", "Structuring the web with semantic HTML.")],
  css: [OFFICIAL("MDN — CSS", "https://developer.mozilla.org/en-US/docs/Learn/CSS", "Layout, flexbox, grid and responsive design."), OFFICIAL("MDN — CSS Layout", "https://developer.mozilla.org/en-US/docs/Learn/CSS/CSS_layout", "Flexbox and Grid in depth.", "intermediate")],
  react: [
    OFFICIAL("React — Learn React", "https://react.dev/learn", "Official tutorial: components, props, state, hooks and data flow."),
    OFFICIAL("React — Managing State", "https://react.dev/learn/managing-state", "Lifting state, reducers and context.", "intermediate"),
    OFFICIAL("React — Reference", "https://react.dev/reference/react", "Hooks and API reference.", "intermediate"),
  ],
  "next.js": [OFFICIAL("Next.js Docs", "https://nextjs.org/docs", "App Router, routing, data fetching and deployment.", "intermediate")],
  redux: [OFFICIAL("Redux Toolkit — Quick Start", "https://redux-toolkit.js.org/tutorials/quick-start", "Modern Redux with slices and hooks.", "intermediate")],
  "node.js": [OFFICIAL("Node.js — Learn", "https://nodejs.org/en/learn", "Official guides on the runtime, modules and the event loop."), OFFICIAL("Node.js API docs", "https://nodejs.org/docs/latest/api/", "Reference for built-in modules.", "intermediate")],
  "express.js": [OFFICIAL("Express — Getting started", "https://expressjs.com/en/starter/installing.html", "Routing, middleware and error handling.")],
  "rest apis": [OFFICIAL("MDN — HTTP overview", "https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview", "Methods, status codes, headers and caching that REST APIs build on."), THIRD("Microsoft REST API Guidelines", "https://github.com/microsoft/api-guidelines", "official_docs", "Widely used conventions for designing REST APIs.", "intermediate")],
  "api design": [THIRD("Microsoft REST API Guidelines", "https://github.com/microsoft/api-guidelines", "official_docs", "Widely used conventions for designing REST APIs.", "intermediate")],
  graphql: [OFFICIAL("GraphQL — Introduction", "https://graphql.org/learn/", "Schemas, queries, mutations and resolvers.", "intermediate")],
  sql: [OFFICIAL("PostgreSQL Tutorial (official manual)", "https://www.postgresql.org/docs/current/tutorial.html", "SQL basics, joins, aggregates and transactions."), THIRD("SQLBolt — Interactive SQL lessons", "https://sqlbolt.com/", "tutorial", "Hands-on lessons on SELECT, JOIN, GROUP BY and more.")],
  postgresql: [OFFICIAL("PostgreSQL Documentation", "https://www.postgresql.org/docs/current/", "The complete PostgreSQL manual.", "intermediate")],
  mysql: [OFFICIAL("MySQL Reference Manual", "https://dev.mysql.com/doc/refman/en/", "Official MySQL documentation.", "intermediate")],
  mongodb: [OFFICIAL("MongoDB Manual", "https://www.mongodb.com/docs/manual/", "Documents, queries, indexes and aggregation.", "intermediate")],
  databases: [OFFICIAL("PostgreSQL Tutorial (official manual)", "https://www.postgresql.org/docs/current/tutorial.html", "Relational database fundamentals through PostgreSQL.")],
  prisma: [OFFICIAL("Prisma Docs", "https://www.prisma.io/docs", "Schema, migrations and the query client.", "intermediate")],
  python: [OFFICIAL("The Python Tutorial", "https://docs.python.org/3/tutorial/", "Official language tutorial."), OFFICIAL("Python Standard Library", "https://docs.python.org/3/library/", "Built-in modules reference.", "intermediate")],
  pandas: [OFFICIAL("pandas — Getting started", "https://pandas.pydata.org/docs/getting_started/index.html", "DataFrames, selection, grouping and reshaping.")],
  git: [OFFICIAL("Pro Git book (free, official)", "https://git-scm.com/book/en/v2", "Branching, merging, rebasing and workflows."), THIRD("GitHub Docs — Get started", "https://docs.github.com/en/get-started", "official_docs", "Pull requests, reviews and collaboration.")],
  docker: [OFFICIAL("Docker — Get started", "https://docs.docker.com/get-started/", "Images, containers, volumes and Compose.")],
  kubernetes: [OFFICIAL("Kubernetes — Basics tutorial", "https://kubernetes.io/docs/tutorials/kubernetes-basics/", "Pods, deployments and services.", "advanced")],
  aws: [OFFICIAL("AWS Documentation", "https://docs.aws.amazon.com/", "Service guides and getting-started tutorials.", "intermediate")],
  azure: [OFFICIAL("Microsoft Learn — Azure", "https://learn.microsoft.com/en-us/azure/", "Azure service documentation and learning paths.", "intermediate")],
  "google cloud": [OFFICIAL("Google Cloud Documentation", "https://cloud.google.com/docs", "Service guides and quickstarts.", "intermediate")],
  "ci/cd": [OFFICIAL("GitHub Actions Docs", "https://docs.github.com/en/actions", "Workflows, jobs and deployment pipelines.", "intermediate")],
  "github actions": [OFFICIAL("GitHub Actions Docs", "https://docs.github.com/en/actions", "Workflows, jobs and deployment pipelines.", "intermediate")],
  testing: [OFFICIAL("Jest — Getting started", "https://jestjs.io/docs/getting-started", "Unit testing JavaScript with matchers and mocks."), OFFICIAL("Testing Library — Guiding principles", "https://testing-library.com/docs/guiding-principles/", "User-centric component testing.", "intermediate")],
  jest: [OFFICIAL("Jest — Getting started", "https://jestjs.io/docs/getting-started", "Unit testing JavaScript with matchers and mocks.")],
  vitest: [OFFICIAL("Vitest Guide", "https://vitest.dev/guide/", "Fast unit testing for Vite projects.")],
  "react testing library": [OFFICIAL("Testing Library — React", "https://testing-library.com/docs/react-testing-library/intro/", "Testing React components the way users use them.", "intermediate")],
  cypress: [OFFICIAL("Cypress Docs", "https://docs.cypress.io/", "End-to-end testing in the browser.", "intermediate")],
  playwright: [OFFICIAL("Playwright Docs", "https://playwright.dev/docs/intro", "Cross-browser end-to-end testing.", "intermediate")],
  "unit testing": [OFFICIAL("Jest — Getting started", "https://jestjs.io/docs/getting-started", "Unit testing JavaScript with matchers and mocks.")],
  "tailwind css": [OFFICIAL("Tailwind CSS Docs", "https://tailwindcss.com/docs", "Utility-first styling reference.")],
  accessibility: [OFFICIAL("MDN — Accessibility", "https://developer.mozilla.org/en-US/docs/Learn/Accessibility", "Semantics, ARIA, keyboard access and testing."), OFFICIAL("W3C WAI — WCAG quick reference", "https://www.w3.org/WAI/WCAG21/quickref/", "Success criteria checklist.", "intermediate")],
  "web performance": [OFFICIAL("web.dev — Learn Performance", "https://web.dev/learn/performance", "Core Web Vitals, loading and rendering optimisation.", "intermediate")],
  "responsive design": [OFFICIAL("MDN — Responsive design", "https://developer.mozilla.org/en-US/docs/Learn/CSS/CSS_layout/Responsive_Design", "Media queries, fluid layouts and images.")],
  authentication: [OFFICIAL("MDN — HTTP authentication", "https://developer.mozilla.org/en-US/docs/Web/HTTP/Authentication", "Auth schemes and headers.", "intermediate"), THIRD("OWASP Authentication Cheat Sheet", "https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html", "official_docs", "Security guidance for login flows and sessions.", "intermediate")],
  security: [THIRD("OWASP Top Ten", "https://owasp.org/www-project-top-ten/", "official_docs", "The most critical web application security risks.", "intermediate")],
  "data structures": [THIRD("LeetCode — Explore", "https://leetcode.com/explore/", "practice_platform", "Structured problem sets by topic (account required; pricing varies).", "intermediate"), THIRD("HackerRank — Data Structures", "https://www.hackerrank.com/domains/data-structures", "practice_platform", "Practice problems by data structure (account required).", "intermediate")],
  algorithms: [THIRD("LeetCode — Explore", "https://leetcode.com/explore/", "practice_platform", "Structured problem sets by topic (account required; pricing varies).", "intermediate")],
  "system design": [THIRD("The System Design Primer (GitHub)", "https://github.com/donnemartin/system-design-primer", "project_example", "Community-maintained guide to designing large-scale systems.", "advanced")],
  "data visualization": [THIRD("Recharts Docs", "https://recharts.org/en-US/guide", "official_docs", "Composable charts for React.", "intermediate")],
  excel: [OFFICIAL("Microsoft Support — Excel training", "https://support.microsoft.com/en-us/excel", "Official Excel help and training articles.")],
  statistics: [THIRD("Khan Academy — Statistics and probability", "https://www.khanacademy.org/math/statistics-probability", "video_course", "Free-to-access lessons on descriptive and inferential statistics.")],
  linux: [THIRD("The Linux Command Line (book site)", "https://linuxcommand.org/tlcl.php", "tutorial", "Shell basics, files, permissions and scripting.")],
  "machine learning": [OFFICIAL("scikit-learn — Getting started", "https://scikit-learn.org/stable/getting_started.html", "Fitting, predicting and evaluating models.", "intermediate")],
};

const ALIASES = { js: "javascript", es6: "javascript", "react.js": "react", reactjs: "react", nodejs: "node.js", node: "node.js", express: "express.js", postgres: "postgresql", ts: "typescript", k8s: "kubernetes", "amazon web services": "aws", "rest": "rest apis", "rest api": "rest apis", "restful apis": "rest apis", "e2e testing": "testing", "integration testing": "testing", "tdd": "testing", "dom": "javascript", "browser apis": "javascript", "async javascript": "javascript", "hooks": "react", "react hooks": "react", "state management": "react", "react state management": "react", "sql joins": "sql", "closures": "javascript", "javascript closures": "javascript" };

const INTERVIEW_PREP = THIRD("Tech Interview Handbook", "https://www.techinterviewhandbook.org/", "interview_prep", "Community guide to coding interviews, behavioural questions and preparation plans.", "intermediate");

export function lookupSkillKey(skill) {
  const k = String(skill ?? "").trim().toLowerCase();
  if (CATALOG[k]) return k;
  if (ALIASES[k] && CATALOG[ALIASES[k]]) return ALIASES[k];
  for (const key of Object.keys(CATALOG)) if (k.includes(key) && key.length >= 3) return key;
  for (const [alias, key] of Object.entries(ALIASES)) if (k.includes(alias) && alias.length >= 4) return key;
  return null;
}

/**
 * Resources for a task. Returns verified catalog entries plus a search suggestion when the
 * catalog has nothing for the skill. Never returns an unverified URL.
 * @param {{ skillName: string, taskType: string, difficulty?: string }} task
 */
export function resourcesForTask(task) {
  const key = lookupSkillKey(task.skillName);
  const out = [];
  if (key) {
    const level = task.difficulty ?? "intermediate";
    const rank = { beginner: 0, intermediate: 1, advanced: 2 };
    const entries = [...CATALOG[key]].sort((a, b) => Math.abs(rank[a.difficulty] - rank[level]) - Math.abs(rank[b.difficulty] - rank[level]));
    out.push(...entries.slice(0, task.taskType === "read_docs" ? 2 : 3).map((r) => ({ ...r })));
  }
  if (task.taskType === "review_interview_questions" || task.taskType === "explain_concept") out.push({ ...INTERVIEW_PREP });
  if (task.taskType === "coding_exercise" && !out.some((r) => r.resourceType === "practice_platform")) {
    out.push(THIRD("Exercism", "https://exercism.org/", "practice_platform", "Language tracks with mentored exercises (account required).", "beginner"));
  }
  if (out.length === 0 || !key) {
    out.push({
      title: `Search: "${task.skillName} ${task.taskType === "tutorial" ? "tutorial" : task.taskType === "mini_project" ? "example project" : "official documentation"}"`,
      resourceType: "search_suggestion",
      url: null,
      urlVerified: false,
      provider: "search",
      description: `No verified entry for "${task.skillName}" in the resource catalog — use this search to find the official documentation.`,
      difficulty: task.difficulty ?? "intermediate",
    });
  }
  return out.slice(0, 4);
}

export function catalogSkills() {
  return Object.keys(CATALOG);
}
