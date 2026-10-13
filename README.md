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

---

## Prerequisites

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
```bash
npm run dev
```

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
```

---

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
