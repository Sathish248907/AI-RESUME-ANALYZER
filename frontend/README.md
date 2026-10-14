# AI Resume Analyzer — Frontend

Next.js 13 (App Router) + React 18 + TypeScript + Tailwind CSS client for the AI Resume Analyzer.
It talks to the Express backend in `../backend` through a single axios client (`src/services/api.ts`).

See the root [README](../README.md) for the full project overview and `../docs/` for architecture, API and setup guides.

## Run

```bash
npm install
cp .env.example .env     # set NEXT_PUBLIC_API_URL (default http://localhost:4000)
npm run dev              # http://localhost:3001
```

Other scripts: `npm run build`, `npm start`, `npx tsc --noEmit` (type-check).

## Environment

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | Base URL of the backend API. Public — contains no secrets. |
| `DATABASE_URL`, `NEXTAUTH_*`, `GEMINI_API_KEY`, OAuth ids | Only used by the legacy Phase 1 Next.js API routes (`/analyze`, `/api/analyze`, `/api/history`). Optional. Never prefix a secret with `NEXT_PUBLIC_`. |

## Structure (how the requested layout maps onto Next.js)

| Requested folder | Here |
|---|---|
| `pages/`, `routes/`, `App.jsx`, `main.jsx` | `src/app/` — file-system routing and the root layout (`src/app/layout.tsx`). `src/routes/index.ts` holds route constants. |
| `components/common` | `src/components/common` (Badge, Button, Card, ProgressBar) |
| `components/layout` | `src/components/layout` (Navbar, Footer) |
| `components/resume` | `src/components/resume` (ResumeDropzone) |
| `components/analyzer` | `src/components/analyzer` + `src/components/results` (analysis results UI) |
| `components/interview` | `src/components/interview` (InterviewQuestionsList) |
| `components/dashboard` | `src/components/dashboard`, `src/components/job-analysis` |
| `layouts/` | `src/layouts` (DashboardLayout) |
| `hooks/` | `src/hooks` (useAuth) |
| `services/api.js` | `src/services/api.ts`, plus `authService.ts`, `resumeAnalysisService.ts`, Phase 3 job services |
| `context/`, `store/` | `src/context` (AuthContext), `src/store` (localStorage helpers) |
| `utils/`, `constants/` | `src/utils`, `src/lib/utils.ts`, `src/constants` |
| `assets/` | `public/` (static files) and `src/assets` |

## Pages

| Route | What it does |
|---|---|
| `/` | Landing page |
| `/auth/login` | Email/password sign-in and registration against the backend (JWT) |
| `/dashboard` | Overview of resume and job analyses |
| `/dashboard/resume-analyzer` | Upload a resume + job description; **AI mode** (backend) or **Demo mode** (local, illustrative) |
| `/dashboard/resume-analysis/[id]` | Results: score and breakdown, skills with evidence, ATS checks, improvements, interview questions; regenerate / delete |
| `/dashboard/my-resumes` | History of AI (account) and demo (browser) analyses |
| `/dashboard/job-analyzer`, `/dashboard/job-analysis/[id]`, `/dashboard/job-history` | Rule-based job-description analysis (Phase 3) |
| `/analyze`, `/history`, `/auth/signin` | Legacy Phase 1 pages using Next.js API routes and Gemini directly |

Demo analyses are clearly labelled as illustrative samples; AI analyses are labelled with the provider that produced them.
