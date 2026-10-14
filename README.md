<<<<<<< HEAD
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
=======
# ResumeAI — AI-Powered Resume Analyzer

Upload a resume (PDF/DOCX) and a job description to get instant AI analysis:
- Resume–job match score
- Matched & missing skills
- ATS compatibility check
- Keyword analysis
- Improvement suggestions
- Likely interview questions
- Analysis history & progress dashboard

## Tech Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 14 (App Router) |
| Styling | Tailwind CSS v3 |
| Database | PostgreSQL + Prisma ORM |
| Auth | Auth.js v5 (GitHub + Google OAuth) |
| AI | Google Gemini 1.5 Flash |
| File parsing | pdf-parse (PDF), mammoth (DOCX) |
| Charts | Recharts |
>>>>>>> 02fa62bd90b076c0b128ed188edce9526daddcb9

---

## Prerequisites

<<<<<<< HEAD
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
=======
- **Node.js ≥ 18.17.0** (Next.js 14 requirement)  
  → Check: `node --version`  
  → Download: https://nodejs.org (LTS)
- **PostgreSQL** running locally or a hosted instance (Supabase, Neon, Railway are free)
- **Gemini API key** — free at https://aistudio.google.com/app/apikey
- (Optional) GitHub and/or Google OAuth app for authentication

---

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment variables
Copy `.env` and fill in your values:

```env
# PostgreSQL connection string
DATABASE_URL="postgresql://postgres:password@localhost:5432/resume_analyzer"

# Auth.js — generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
NEXTAUTH_SECRET="your-secret"
NEXTAUTH_URL="http://localhost:3000"

# OAuth providers (optional — remove providers you don't use)
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GITHUB_CLIENT_ID=""
GITHUB_CLIENT_SECRET=""

# Gemini AI
GEMINI_API_KEY="your-gemini-api-key"
```

### 3. Set up the database
```bash
# Push schema to your database
npm run db:push

# Or run migrations (recommended for production)
npm run db:migrate
```

### 4. Run the development server
>>>>>>> 02fa62bd90b076c0b128ed188edce9526daddcb9
```bash
npm run dev
```

<<<<<<< HEAD
### Start Services Individually
```bash
# Start frontend only (http://localhost:3001)
npm run dev:frontend

# Start backend only (http://localhost:4000)
npm run dev:backend
=======
Open [http://localhost:3000](http://localhost:3000).

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx                  # Landing page
│   ├── analyze/page.tsx          # Upload + analyze page
│   ├── dashboard/page.tsx        # Progress dashboard
│   ├── history/page.tsx          # Analysis history
│   ├── auth/signin/page.tsx      # Sign-in page
│   └── api/
│       ├── parse-resume/route.ts # PDF/DOCX text extraction
│       ├── analyze/route.ts      # AI analysis endpoint
│       ├── history/route.ts      # Saved analyses CRUD
│       └── auth/[...nextauth]/   # Auth.js handler
├── components/
│   ├── ui/                       # Button, Card, Badge, ProgressBar
│   ├── layout/                   # Navbar, Footer
│   ├── resume/                   # ResumeDropzone
│   └── dashboard/                # ScoreGauge, SkillsPanel, etc.
├── lib/
│   ├── prisma.ts                 # Prisma client singleton
│   ├── gemini.ts                 # Gemini AI functions
│   ├── auth.ts                   # Auth.js config
│   └── utils.ts                  # Helpers
└── types/index.ts                # Shared TypeScript types
>>>>>>> 02fa62bd90b076c0b128ed188edce9526daddcb9
```

---

<<<<<<< HEAD
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
=======
## Using without a database

The app works without PostgreSQL — analysis results just won't be saved to history. 
The `/dashboard` and `/history` pages will show empty states gracefully.

---

## Getting a Gemini API Key

1. Go to https://aistudio.google.com/app/apikey
2. Sign in with a Google account
3. Click **Create API Key**
4. Copy it into your `.env` as `GEMINI_API_KEY`

The free tier includes generous usage limits for personal/portfolio projects.

---

## Production deployment

Recommended: [Vercel](https://vercel.com) + [Neon](https://neon.tech) (serverless Postgres, free tier).

```bash
npm run build
npm start
```
>>>>>>> 02fa62bd90b076c0b128ed188edce9526daddcb9
