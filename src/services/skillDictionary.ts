/**
 * skillDictionary.ts
 * Configurable dictionaries used by the rule-based job description parser and
 * the resume-to-job comparison service. Everything here is data — no logic —
 * so it can later be swapped for an AI-backed extraction service without
 * touching the UI.
 */

export type SkillCategory =
  | "Programming Languages"
  | "Frontend Technologies"
  | "Backend Technologies"
  | "Databases"
  | "Cloud and DevOps"
  | "Testing Tools"
  | "Developer Tools"
  | "Soft Skills"
  | "Other";

export const SKILL_CATEGORIES: SkillCategory[] = [
  "Programming Languages",
  "Frontend Technologies",
  "Backend Technologies",
  "Databases",
  "Cloud and DevOps",
  "Testing Tools",
  "Developer Tools",
  "Soft Skills",
  "Other",
];

export interface SkillDefinition {
  /** Canonical display name */
  name: string;
  /** Alternative spellings. Matched case-insensitively unless `caseSensitive` is set. */
  aliases: string[];
  category: SkillCategory;
  /** Match aliases exactly as written (used for words with common English meanings). */
  caseSensitive?: boolean;
  /** Canonical names of related skills, used for "partial match" and inferred keywords. */
  related?: string[];
}

export const SKILL_DEFINITIONS: SkillDefinition[] = [
  // ── Programming Languages ────────────────────────────────────────────────
  { name: "JavaScript", aliases: ["JavaScript", "Javascript", "JS", "ES6", "ES2015+", "ECMAScript"], category: "Programming Languages", related: ["TypeScript", "Node.js"] },
  { name: "TypeScript", aliases: ["TypeScript", "Typescript", "TS"], category: "Programming Languages", caseSensitive: true, related: ["JavaScript"] },
  { name: "Python", aliases: ["Python"], category: "Programming Languages", related: ["Django", "Flask", "FastAPI"] },
  { name: "Java", aliases: ["Java"], category: "Programming Languages", caseSensitive: true, related: ["Spring Boot", "Kotlin"] },
  { name: "Kotlin", aliases: ["Kotlin"], category: "Programming Languages", related: ["Java"] },
  { name: "C#", aliases: ["C#", "C Sharp", "CSharp"], category: "Programming Languages", related: [".NET"] },
  { name: "C++", aliases: ["C++", "CPP"], category: "Programming Languages" },
  { name: "Go", aliases: ["Golang", "Go programming", "Go language", "Go (Golang)"], category: "Programming Languages" },
  { name: "Rust", aliases: ["Rust"], category: "Programming Languages", caseSensitive: true },
  { name: "Ruby", aliases: ["Ruby"], category: "Programming Languages", caseSensitive: true, related: ["Ruby on Rails"] },
  { name: "PHP", aliases: ["PHP"], category: "Programming Languages", related: ["Laravel"] },
  { name: "Swift", aliases: ["Swift"], category: "Programming Languages", caseSensitive: true },
  { name: "Scala", aliases: ["Scala"], category: "Programming Languages" },
  { name: "SQL", aliases: ["SQL"], category: "Programming Languages", related: ["PostgreSQL", "MySQL", "SQL Server"] },
  { name: "HTML", aliases: ["HTML", "HTML5"], category: "Frontend Technologies", related: ["CSS"] },
  { name: "CSS", aliases: ["CSS", "CSS3"], category: "Frontend Technologies", related: ["Sass", "Tailwind CSS"] },
  { name: "Bash", aliases: ["Bash", "Shell scripting", "Shell script"], category: "Developer Tools" },

  // ── Frontend ─────────────────────────────────────────────────────────────
  { name: "React", aliases: ["React", "React.js", "ReactJS"], category: "Frontend Technologies", caseSensitive: true, related: ["Next.js", "Redux", "JavaScript"] },
  { name: "Next.js", aliases: ["Next.js", "NextJS", "Nextjs"], category: "Frontend Technologies", related: ["React"] },
  { name: "Vue.js", aliases: ["Vue", "Vue.js", "VueJS", "Nuxt", "Nuxt.js"], category: "Frontend Technologies", caseSensitive: true },
  { name: "Angular", aliases: ["Angular", "AngularJS"], category: "Frontend Technologies", caseSensitive: true },
  { name: "Svelte", aliases: ["Svelte", "SvelteKit"], category: "Frontend Technologies" },
  { name: "Redux", aliases: ["Redux", "Redux Toolkit"], category: "Frontend Technologies", related: ["React"] },
  { name: "Tailwind CSS", aliases: ["Tailwind", "Tailwind CSS", "TailwindCSS"], category: "Frontend Technologies", related: ["CSS"] },
  { name: "Sass", aliases: ["Sass", "SCSS", "LESS"], category: "Frontend Technologies", caseSensitive: true, related: ["CSS"] },
  { name: "Webpack", aliases: ["Webpack"], category: "Frontend Technologies", related: ["Vite"] },
  { name: "Vite", aliases: ["Vite"], category: "Frontend Technologies", caseSensitive: true, related: ["Webpack"] },
  { name: "Responsive Design", aliases: ["Responsive design", "Responsive web design", "Mobile-first"], category: "Frontend Technologies" },
  { name: "Accessibility", aliases: ["Accessibility", "a11y", "WCAG"], category: "Frontend Technologies" },
  { name: "React Native", aliases: ["React Native"], category: "Frontend Technologies", related: ["React"] },
  { name: "Flutter", aliases: ["Flutter"], category: "Frontend Technologies", caseSensitive: true },

  // ── Backend ──────────────────────────────────────────────────────────────
  { name: "Node.js", aliases: ["Node.js", "NodeJS", "Node js", "Node"], category: "Backend Technologies", caseSensitive: true, related: ["Express.js", "JavaScript"] },
  { name: "Express.js", aliases: ["Express.js", "ExpressJS", "Express"], category: "Backend Technologies", caseSensitive: true, related: ["Node.js"] },
  { name: "NestJS", aliases: ["NestJS", "Nest.js"], category: "Backend Technologies", related: ["Node.js"] },
  { name: "Django", aliases: ["Django"], category: "Backend Technologies", related: ["Python"] },
  { name: "Flask", aliases: ["Flask"], category: "Backend Technologies", caseSensitive: true, related: ["Python"] },
  { name: "FastAPI", aliases: ["FastAPI"], category: "Backend Technologies", related: ["Python"] },
  { name: "Spring Boot", aliases: ["Spring Boot", "Spring Framework", "Spring MVC", "Spring"], category: "Backend Technologies", caseSensitive: true, related: ["Java"] },
  { name: ".NET", aliases: [".NET", "ASP.NET", "dotnet", ".NET Core"], category: "Backend Technologies", related: ["C#"] },
  { name: "Ruby on Rails", aliases: ["Ruby on Rails", "Rails"], category: "Backend Technologies", caseSensitive: true, related: ["Ruby"] },
  { name: "Laravel", aliases: ["Laravel"], category: "Backend Technologies", related: ["PHP"] },
  { name: "REST APIs", aliases: ["REST", "RESTful", "REST API", "REST APIs", "RESTful APIs", "RESTful services"], category: "Backend Technologies", related: ["GraphQL"] },
  { name: "GraphQL", aliases: ["GraphQL"], category: "Backend Technologies", related: ["REST APIs"] },
  { name: "Microservices", aliases: ["Microservices", "Microservice architecture", "Micro-services"], category: "Backend Technologies" },
  { name: "WebSockets", aliases: ["WebSockets", "WebSocket", "Socket.io"], category: "Backend Technologies" },
  { name: "Message Queues", aliases: ["Kafka", "RabbitMQ", "Message queues", "Pub/Sub", "SQS"], category: "Backend Technologies" },

  // ── Databases ────────────────────────────────────────────────────────────
  { name: "PostgreSQL", aliases: ["PostgreSQL", "Postgres"], category: "Databases", related: ["SQL", "MySQL"] },
  { name: "MySQL", aliases: ["MySQL", "MariaDB"], category: "Databases", related: ["SQL", "PostgreSQL"] },
  { name: "SQL Server", aliases: ["SQL Server", "MSSQL", "T-SQL"], category: "Databases", related: ["SQL"] },
  { name: "MongoDB", aliases: ["MongoDB", "Mongo"], category: "Databases", related: ["NoSQL"] },
  { name: "Redis", aliases: ["Redis"], category: "Databases" },
  { name: "Elasticsearch", aliases: ["Elasticsearch", "ElasticSearch", "OpenSearch"], category: "Databases" },
  { name: "DynamoDB", aliases: ["DynamoDB"], category: "Databases", related: ["AWS", "NoSQL"] },
  { name: "Firebase", aliases: ["Firebase", "Firestore"], category: "Databases" },
  { name: "NoSQL", aliases: ["NoSQL"], category: "Databases", related: ["MongoDB"] },
  { name: "Prisma", aliases: ["Prisma"], category: "Databases", related: ["PostgreSQL"] },
  { name: "Oracle", aliases: ["Oracle Database", "Oracle DB", "Oracle SQL"], category: "Databases" },

  // ── Cloud & DevOps ───────────────────────────────────────────────────────
  { name: "AWS", aliases: ["AWS", "Amazon Web Services", "EC2", "S3", "AWS Lambda"], category: "Cloud and DevOps", related: ["Azure", "Google Cloud"] },
  { name: "Azure", aliases: ["Azure", "Microsoft Azure"], category: "Cloud and DevOps", related: ["AWS"] },
  { name: "Google Cloud", aliases: ["GCP", "Google Cloud", "Google Cloud Platform"], category: "Cloud and DevOps", related: ["AWS"] },
  { name: "Docker", aliases: ["Docker", "Containers", "Containerization"], category: "Cloud and DevOps", related: ["Kubernetes"] },
  { name: "Kubernetes", aliases: ["Kubernetes", "K8s", "EKS", "GKE"], category: "Cloud and DevOps", related: ["Docker"] },
  { name: "CI/CD", aliases: ["CI/CD", "CI-CD", "Continuous Integration", "Continuous Delivery", "Continuous Deployment"], category: "Cloud and DevOps", related: ["GitHub Actions", "Jenkins"] },
  { name: "GitHub Actions", aliases: ["GitHub Actions"], category: "Cloud and DevOps", related: ["CI/CD"] },
  { name: "Jenkins", aliases: ["Jenkins"], category: "Cloud and DevOps", related: ["CI/CD"] },
  { name: "Terraform", aliases: ["Terraform", "Infrastructure as Code", "IaC"], category: "Cloud and DevOps" },
  { name: "Linux", aliases: ["Linux", "Unix"], category: "Cloud and DevOps" },
  { name: "Nginx", aliases: ["Nginx", "Apache HTTP"], category: "Cloud and DevOps" },
  { name: "Serverless", aliases: ["Serverless"], category: "Cloud and DevOps", related: ["AWS"] },
  { name: "Monitoring", aliases: ["Datadog", "Grafana", "Prometheus", "New Relic", "Observability"], category: "Cloud and DevOps" },

  // ── Testing ──────────────────────────────────────────────────────────────
  { name: "Jest", aliases: ["Jest"], category: "Testing Tools", caseSensitive: true, related: ["Vitest", "React Testing Library"] },
  { name: "Vitest", aliases: ["Vitest"], category: "Testing Tools", related: ["Jest"] },
  { name: "React Testing Library", aliases: ["React Testing Library", "Testing Library"], category: "Testing Tools", related: ["Jest"] },
  { name: "Cypress", aliases: ["Cypress"], category: "Testing Tools", related: ["Playwright"] },
  { name: "Playwright", aliases: ["Playwright"], category: "Testing Tools", related: ["Cypress"] },
  { name: "Selenium", aliases: ["Selenium"], category: "Testing Tools" },
  { name: "Unit Testing", aliases: ["Unit testing", "Unit tests", "TDD", "Test-driven development", "Test driven development"], category: "Testing Tools" },
  { name: "Integration Testing", aliases: ["Integration testing", "Integration tests", "End-to-end testing", "E2E testing", "e2e tests"], category: "Testing Tools" },
  { name: "PyTest", aliases: ["PyTest", "pytest"], category: "Testing Tools", related: ["Python"] },
  { name: "JUnit", aliases: ["JUnit"], category: "Testing Tools", related: ["Java"] },

  // ── Developer Tools ──────────────────────────────────────────────────────
  { name: "Git", aliases: ["Git", "GitHub", "GitLab", "Bitbucket", "Version control"], category: "Developer Tools" },
  { name: "Jira", aliases: ["Jira", "JIRA"], category: "Developer Tools", related: ["Agile"] },
  { name: "Figma", aliases: ["Figma", "Sketch", "Adobe XD"], category: "Developer Tools" },
  { name: "Postman", aliases: ["Postman", "Swagger", "OpenAPI"], category: "Developer Tools", related: ["REST APIs"] },
  { name: "VS Code", aliases: ["VS Code", "Visual Studio Code", "Visual Studio"], category: "Developer Tools" },
  { name: "Storybook", aliases: ["Storybook"], category: "Developer Tools", related: ["React"] },
  { name: "npm", aliases: ["npm", "yarn", "pnpm"], category: "Developer Tools", caseSensitive: true },
  { name: "Agile", aliases: ["Agile", "Scrum", "Kanban", "Sprint planning"], category: "Developer Tools" },

  // ── Data ─────────────────────────────────────────────────────────────────
  { name: "Pandas", aliases: ["Pandas", "NumPy"], category: "Other", related: ["Python"] },
  { name: "Power BI", aliases: ["Power BI", "PowerBI"], category: "Other", related: ["Tableau"] },
  { name: "Tableau", aliases: ["Tableau"], category: "Other", related: ["Power BI"] },
  { name: "Excel", aliases: ["Excel", "Microsoft Excel", "Google Sheets"], category: "Other", caseSensitive: true },
  { name: "Machine Learning", aliases: ["Machine learning", "ML", "Deep learning", "TensorFlow", "PyTorch", "scikit-learn"], category: "Other" },
  { name: "Data Visualization", aliases: ["Data visualization", "Data visualisation", "Dashboards"], category: "Other" },
  { name: "ETL", aliases: ["ETL", "Data pipelines", "Data pipeline"], category: "Other" },

  // ── Soft Skills ──────────────────────────────────────────────────────────
  { name: "Communication", aliases: ["Communication", "Communication skills", "Verbal and written"], category: "Soft Skills" },
  { name: "Teamwork", aliases: ["Teamwork", "Team player", "Cross-functional", "Collaboration", "Collaborative"], category: "Soft Skills" },
  { name: "Problem Solving", aliases: ["Problem solving", "Problem-solving", "Analytical skills", "Analytical mindset"], category: "Soft Skills" },
  { name: "Leadership", aliases: ["Leadership", "Mentoring", "Mentorship", "Lead a team", "Mentor"], category: "Soft Skills" },
  { name: "Attention to Detail", aliases: ["Attention to detail", "Detail-oriented", "Detail oriented"], category: "Soft Skills" },
  { name: "Time Management", aliases: ["Time management", "Prioritization", "Prioritisation", "Deadlines"], category: "Soft Skills" },
  { name: "Adaptability", aliases: ["Adaptability", "Fast-paced", "Fast paced", "Adaptable"], category: "Soft Skills" },
  { name: "Ownership", aliases: ["Ownership", "Self-starter", "Self-motivated", "Proactive"], category: "Soft Skills" },
  { name: "Critical Thinking", aliases: ["Critical thinking", "Decision making", "Decision-making"], category: "Soft Skills" },
];

/** Phrases that indicate a skill is strictly required. */
export const REQUIRED_CUES = [
  "required",
  "must have",
  "must-have",
  "must be",
  "must hold",
  "you must",
  "must ",
  "mandatory",
  "essential",
  "minimum",
  "at least",
  "strong experience",
  "proven experience",
  "proficient",
  "proficiency",
  "expert",
  "expertise",
  "solid understanding",
  "deep understanding",
  "hands-on experience",
  "demonstrated",
  "we require",
];

/** Phrases that indicate a skill is preferred / nice to have. */
export const PREFERRED_CUES = [
  "nice to have",
  "nice-to-have",
  "preferred",
  "preferably",
  "bonus",
  "a plus",
  "plus if",
  "is a plus",
  "ideally",
  "familiarity",
  "familiar with",
  "exposure to",
  "desirable",
  "would be great",
  "good to have",
  "advantageous",
  "an advantage",
  "optional",
];

export type SectionType = "required" | "preferred" | "responsibilities" | "benefits" | "about" | "other";

/** Section headings (tested against a trimmed line) mapped to a section type. */
export const SECTION_HEADINGS: { pattern: RegExp; section: SectionType }[] = [
  { pattern: /^(nice[- ]to[- ]haves?|preferred( qualifications| skills| experience)?|bonus( points| skills)?|desirable( skills)?|good to have|would be a plus|it'?s a plus if)\b/i, section: "preferred" },
  { pattern: /^(requirements|required( skills| qualifications| experience)?|qualifications|minimum qualifications|basic qualifications|what we('re| are) looking for|what you('ll| will) need|what you bring|must[- ]haves?|skills( and experience| & experience)?|your profile|about you|who you are|you have|key skills|technical skills|experience required|what we need)\b/i, section: "required" },
  { pattern: /^(responsibilities|key responsibilities|what you('ll| will) do|your role|the role|duties|role overview|day[- ]to[- ]day|in this role|what you('ll| will) be doing|you will|your responsibilities|job duties)\b/i, section: "responsibilities" },
  { pattern: /^(benefits|perks|what we offer|compensation|salary|why join|why us|our offer)\b/i, section: "benefits" },
  { pattern: /^(about (us|the company|the team)|who we are|company overview|our mission)\b/i, section: "about" },
];

/** Role-specific vocabulary that is useful on a resume but is not a "skill" per se. */
export const ROLE_TERMS = [
  "Agile", "Scrum", "Kanban", "Sprint", "Stakeholders", "Product roadmap", "Code review", "Code reviews",
  "Design patterns", "System design", "Architecture", "Scalability", "Performance optimization",
  "Clean code", "Best practices", "Technical documentation", "Cross-functional", "User experience",
  "Product managers", "Designers", "Data-driven", "A/B testing", "SEO", "Security",
  "Authentication", "Authorization", "OAuth", "API design", "Debugging", "Troubleshooting",
  "Refactoring", "Pair programming", "Technical debt", "Deployment", "Production", "Legacy systems",
  "Component library", "State management", "Server-side rendering", "Web performance",
  "Data modeling", "Reporting", "KPIs", "Business requirements", "Requirements gathering",
];

/** Action verbs commonly found in responsibilities and strong resume bullets. */
export const ACTION_WORDS = [
  "build", "design", "develop", "implement", "maintain", "collaborate", "lead", "own", "deliver",
  "optimize", "optimise", "improve", "write", "review", "test", "deploy", "architect", "mentor",
  "communicate", "coordinate", "define", "drive", "analyze", "analyse", "integrate", "migrate",
  "monitor", "automate", "document", "troubleshoot", "debug", "scale", "ship", "partner", "support",
  "contribute", "create", "ensure", "translate", "participate", "research", "evaluate", "manage",
];

/** Degree names recognised by the education extractor. */
export const DEGREE_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\b(ph\.?d|doctorate|doctoral)\b/i, label: "PhD / Doctorate" },
  { pattern: /\b(master'?s?|m\.?sc?\b|m\.?eng|mba|m\.?tech)\b/i, label: "Master's degree" },
  { pattern: /\b(bachelor'?s?|b\.?sc?\b|b\.?e\b|b\.?eng|b\.?tech|undergraduate degree)\b/i, label: "Bachelor's degree" },
  { pattern: /\b(associate'?s? degree|diploma)\b/i, label: "Associate degree / Diploma" },
  { pattern: /\b(bootcamp|boot camp)\b/i, label: "Bootcamp" },
];

export const DEGREE_FIELDS = [
  "Computer Science", "Software Engineering", "Information Technology", "Information Systems",
  "Computer Engineering", "Electrical Engineering", "Engineering", "Mathematics", "Statistics",
  "Data Science", "Physics", "Business", "Economics", "a related field", "related field", "related discipline",
];

export const CERTIFICATION_PATTERNS: RegExp[] = [
  /AWS Certified[^.,;\n)]*/gi,
  /Azure (Fundamentals|Administrator|Developer|Solutions Architect)[^.,;\n)]*/gi,
  /Google (Cloud|Professional) (Certified|Engineer|Architect)[^.,;\n)]*/gi,
  /\bCKAD?\b|Certified Kubernetes[^.,;\n)]*/gi,
  /\bPMP\b|\bCSM\b|\bPSM\b|Certified Scrum ?Master|Scrum Master certification/gi,
  /\bCISSP\b|\bCEH\b|\bCompTIA[^.,;\n)]*/gi,
  /\bOCP\b|Oracle Certified[^.,;\n)]*/gi,
  /Microsoft Certified[^.,;\n)]*/gi,
  /\bITIL\b/gi,
  /Salesforce Certified[^.,;\n)]*/gi,
];

export const SENIORITY_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\b(intern|internship)\b/i, label: "Intern" },
  { pattern: /\b(entry[- ]level|graduate|junior|jr\.?)\b/i, label: "Junior / Entry-level" },
  { pattern: /\b(mid[- ]level|intermediate)\b/i, label: "Mid-level" },
  { pattern: /\b(senior|sr\.?)\b/i, label: "Senior" },
  { pattern: /\b(staff engineer|staff software)\b/i, label: "Staff" },
  { pattern: /\b(principal)\b/i, label: "Principal" },
  { pattern: /\b(tech lead|team lead|lead engineer|lead developer|engineering manager|head of)\b/i, label: "Lead / Manager" },
];

export const INDUSTRY_TERMS = [
  "fintech", "financial services", "banking", "healthcare", "health tech", "e-commerce", "ecommerce",
  "retail", "SaaS", "B2B", "B2C", "edtech", "gaming", "media", "advertising", "adtech",
  "logistics", "supply chain", "insurance", "telecom", "automotive", "startup", "enterprise",
  "government", "non-profit", "cybersecurity", "real estate", "travel", "hospitality",
];

export const STOP_WORDS = new Set([
  "the", "and", "a", "an", "to", "of", "in", "for", "with", "on", "or", "as", "is", "are", "be", "we",
  "you", "our", "your", "will", "that", "this", "at", "by", "from", "it", "its", "their", "they", "have",
  "has", "who", "what", "about", "us", "all", "can", "not", "but", "if", "more", "than", "into",
  "also", "across", "including", "etc", "such", "other", "new", "work", "working", "team", "role",
  "experience", "years", "year", "strong", "ability", "skills", "knowledge", "understanding", "using",
  "use", "well", "both", "within", "through", "while", "where", "when", "how", "any", "may", "would",
  "should", "must", "like", "per", "over", "up", "out", "so", "do", "does", "been", "being", "job",
  "company", "position", "candidate", "candidates", "required", "preferred", "plus", "related",
  "responsibilities", "requirements", "qualifications", "looking", "join", "help", "day", "based",
  "able", "good", "great", "best", "high", "quality", "others", "one", "two", "three", "level",
]);
