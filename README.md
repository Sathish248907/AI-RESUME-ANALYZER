# AI Resume Analyzer

A production-grade, full-stack AI Resume Analyzer architected with strictly separated `frontend/` and `backend/` services. The application evaluates resumes against target job descriptions, computes deterministic ATS readiness and skill match scores, surfaces missing skills and keyword gaps, generates actionable improvements, and creates tailored technical interview preparation questions.

---

## Features

- **Resume Upload & Text Extraction**: In-memory parsing of PDF and DOCX documents with magic-byte format validation and sanitization.
- **Job Description Parsing & Requirement Extraction**: Automatic classification of required vs. preferred skills, education, and years of experience.
- **Deterministic Match & ATS Scoring**: Evidence-backed scoring computed on the backend from verified extractions (not opaque model hallucinations).
- **Skill Alignment Breakdown**: Visual mapping of direct matches, inferred skills, missing competencies, and keyword gaps.
- **Actionable Suggestions**: Prioritized suggestions categorized by content, impact, and formatting.
- **AI-Powered Technical Interview Preparation**: Role-tailored questions categorized by topic, difficulty, and rationale.
- **Progress Tracking & Analytics**: User dashboard with analysis history, weak-topic identification, and saved resumes.
- **Dual Flow**: Demo mode (local in-browser storage) and authenticated mode (PostgreSQL persistence via Prisma ORM).

---

## Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | Next.js 13 (App Router), React 18, TypeScript, Tailwind CSS, Lucide React, Axios |
| **Backend** | Node.js, Express, Prisma ORM, Multer, Helmet, CORS, Express-Rate-Limit, Zod |
| **Database** | PostgreSQL |
| **AI Providers** | Anthropic Claude (`@anthropic-ai/sdk`), Google Gemini (`@google/generative-ai`) |
| **Document Parsing**| `pdf-parse`, `mammoth` |
| **Testing** | Node test runner (`node:test`, `node:assert/strict`) |

---

## Final Project Directory Structure

```
AI-RESUME-ANALYZER/
│
├── frontend/                          # Client application (Next.js 13 / React 18)
│   ├── public/                        # Static assets, SVG icons, and favicons
│   ├── src/
│   │   ├── app/                       # Next.js App Router pages and route handlers
│   │   │   ├── analyze/               # Interactive upload & analysis page
│   │   │   ├── auth/                  # Authentication pages (login, signin)
│   │   │   ├── dashboard/             # User dashboard, job analyzer & history
│   │   │   ├── history/               # Analysis records history
│   │   │   ├── layout.tsx             # Root application shell (Navbar, Footer)
│   │   │   └── page.tsx               # Marketing landing page
│   │   ├── assets/                    # Asset documentation and component assets
│   │   ├── components/
│   │   │   ├── common/                # Reusable UI primitives (Badge, Button, Card, ProgressBar)
│   │   │   ├── layout/                # Layout components (Navbar, Footer)
│   │   │   ├── resume/                # ResumeDropzone component
│   │   │   ├── analyzer/              # FilePreview, JobDescriptionForm, AnalysisLoading
│   │   │   ├── interview/             # InterviewQuestionsList
│   │   │   ├── job-analysis/          # JobOverviewCard, ExperienceEducationCard, KeywordAnalysisCard
│   │   │   ├── dashboard/             # ScoreGauge, SkillsPanel, SuggestionsList
│   │   │   └── results/               # ATSReadinessCard, MatchScoreCard, SkillsComparison
│   │   ├── context/                   # React Context providers (AuthContext)
│   │   ├── hooks/                     # Custom hooks (useAuth)
│   │   ├── layouts/                   # Reusable page layouts (DashboardLayout)
│   │   ├── routes/                    # Centralized route & API constants
│   │   ├── services/                  # API client (api.ts), authService, resumeParser
│   │   ├── store/                     # Client cache and storage utilities
│   │   ├── types/                     # Shared TypeScript interfaces
│   │   └── utils/                     # Formatting and utility functions
│   ├── .env.example                   # Frontend environment configuration template
│   ├── package.json                   # Frontend scripts and dependencies
│   ├── tsconfig.json                  # TypeScript configuration
│   └── README.md                      # Frontend-specific documentation
│
├── backend/                           # API service (Node.js / Express / Prisma)
│   ├── src/
│   │   ├── config/                    # Environment validation (env.js) and Prisma client
│   │   ├── controllers/               # Request controllers (authController, analysisController, resumeController)
│   │   ├── routes/                    # Express routers (authRoutes, analysisRoutes, resumeRoutes)
│   │   ├── models/                    # Data access layer (analysisRepository.js)
│   │   ├── services/
│   │   │   ├── ai/                    # LLM provider abstraction (llmProvider.js)
│   │   │   ├── resume/                # ATS engine, scoring, and text parsing services
│   │   │   ├── interview/             # Technical interview question generator
│   │   │   └── authService.js         # User registration and JWT issuance
│   │   ├── middleware/                # Auth token verification, rate limiting, error handlers
│   │   ├── validators/                # Request & AI output schemas (Zod)
│   │   ├── utils/                     # Errors, redaction logger, prompt sanitizer
│   │   ├── jobs/                      # Background task definitions
│   │   ├── app.js                     # Express application factory
│   │   └── server.js                  # HTTP server entry point
│   ├── prisma/
│   │   ├── schema.prisma              # Database schema definitions
│   │   └── migrations/                # Database migrations
│   ├── tests/                         # Node:test test suites (api, parsing, scoring, validation)
│   ├── uploads/                       # Ephemeral upload staging (.gitkeep)
│   ├── .env.example                   # Backend environment configuration template
│   ├── package.json                   # Backend scripts and dependencies
│   └── README.md                      # Backend-specific documentation
│
├── docs/                              # Project architecture & API specifications
│   ├── architecture.md                # System design, data flow, security model
│   ├── api.md                         # Complete REST API reference
│   └── setup.md                       # Comprehensive setup guide
│
├── .gitignore                         # Root Git ignore rules (protects credentials & builds)
├── package.json                       # Monorepo task runner
├── README.md                          # Root project documentation
└── LICENSE                            # MIT License
```

---

## Prerequisites

- **Node.js**: `v18.12.0` or newer
- **npm**: `v9.0.0` or newer
- **PostgreSQL**: Local database or hosted provider (Supabase / Neon / Railway)
- **AI Provider Key**: Anthropic API Key or Google Gemini API Key

---

## Installation & Setup

### 1. Install Dependencies
Run the install command from the project root:

```bash
npm run install:all
```

### 2. Configure Environment Variables

**Frontend (`frontend/.env`):**
```bash
cp frontend/.env.example frontend/.env
```
Ensure the API base URL is configured:
```env
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
```

**Backend (`backend/.env`):**
```bash
cp backend/.env.example backend/.env
```
Configure your database and AI provider:
```env
PORT=4000
NODE_ENV=development
FRONTEND_URL=http://localhost:3001

# PostgreSQL
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/resume_analyzer?schema=public"

# Auth
JWT_SECRET="generate-a-secure-random-secret-key-at-least-32-chars"
JWT_EXPIRES_IN=7d

# AI Provider ("anthropic" or "gemini")
LLM_PROVIDER=anthropic
LLM_API_KEY="your-api-key"
LLM_MODEL="claude-opus-5-5"
```

### 3. Database Migration
```bash
npm run db:generate
npm run db:migrate
```

---

## Running the Application

### Start Frontend and Backend Together (Recommended)
```bash
npm run dev
```

### Start Services Individually
```bash
# Start frontend only (http://localhost:3001)
npm run dev:frontend

# Start backend only (http://localhost:4000)
npm run dev:backend
```

---

## Testing & Quality Assurance

Run the automated test suites:

```bash
# Run backend test suite (unit, integration, and HTTP tests)
npm test

# Build and typecheck frontend
npm run build
```

---

## API Endpoints Summary

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/health` | Server status and AI provider configuration | No |
| `POST` | `/api/auth/register` | Create a new user account | No |
| `POST` | `/api/auth/login` | Authenticate and obtain JWT | No |
| `GET` | `/api/auth/me` | Fetch authenticated user profile | Bearer Token |
| `POST` | `/api/resume/parse` | Parse uploaded PDF/DOCX into clean text | No |
| `POST` | `/api/analysis/run` | Execute resume vs. job analysis | Optional |
| `GET` | `/api/analysis/history` | List user analysis records | Bearer Token |
| `GET` | `/api/analysis/:id` | Fetch specific analysis result | Bearer Token |
| `DELETE`| `/api/analysis/:id` | Delete an analysis record | Bearer Token |

Detailed request/response payloads are documented in [`docs/api.md`](docs/api.md).

---

## GitHub Workflow & Safety

1. **Protected Secrets**: `.env`, `.env.*`, and upload buffers are excluded by `.gitignore`.
2. **Branch Hygiene**: Never use destructive commands (`git push --force`, `git reset --hard`).
3. **Continuous Verification**: Ensure `npm test` and `npm run build` pass before opening pull requests.

---

## License

This project is licensed under the [MIT License](LICENSE).

## Phase 5 — Persistent dashboard, resume history, job tracking

See [docs/phase5.md](docs/phase5.md) for the schema changes, migration commands, new API endpoints, pages and known limitations.

## Phase 6 — AI mock interviews & answer evaluation

See [docs/phase6.md](docs/phase6.md) for the interview models, versioned scoring rubric, report aggregation method, endpoints and limitations.

## Phase 7 — Personalized learning roadmap & skill gap tracking

See [docs/phase7.md](docs/phase7.md) for the skill-gap scoring method, roadmap generation/validation pipeline, progress derivation, `/api/learning/*` endpoints, pages, tests and limitations.
