# Architecture & System Design

The **AI Resume Analyzer** is architected as a clean, modular, production-ready monorepo with strict separation of concerns between `frontend/` and `backend/`.

```
AI-RESUME-ANALYZER/
├── frontend/          # Next.js 13 (App Router), React 18, Tailwind CSS, TypeScript
├── backend/           # Node.js, Express, Prisma ORM, PostgreSQL, LLM Integrations
├── docs/              # Architectural, API, and setup documentation
├── package.json       # Monorepo task runner (npm scripts)
└── README.md          # Comprehensive project guide
```

---

## 1. High-Level Architecture

```
[ User Browser ]
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│                 Frontend (Next.js / React)                  │
│  - App Router: /dashboard, /analyze, /history, /auth        │
│  - Services Layer: src/services/api.ts                      │
│  - UI: Common components, score gauges, skill breakdowns   │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTPS / JSON / Multipart
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                   Backend (Node.js / Express)               │
│  - Security: Helmet, CORS, Rate Limiters, Sanitization      │
│  - Controllers: Auth, Resume Upload, Analysis Execution     │
│  - Domain Services: ATS Parsing, Skill Extraction, Scoring  │
│  - AI Service: Provider Abstraction (Anthropic / Gemini)    │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
               ▼                              ▼
┌──────────────────────────────┐ ┌────────────────────────────┐
│      Database (Prisma)       │ │     AI Provider APIs       │
│  - PostgreSQL: Users,        │ │  - Anthropic Claude        │
│    Analyses, Skills, History │ │  - Google Gemini           │
└──────────────────────────────┘ └────────────────────────────┘
```

---

## 2. Frontend Responsibilities (`frontend/`)

1. **User Experience & Presentation**:
   - Modern responsive UI with Tailwind CSS and Lucide React icons.
   - Interactive resume dropzone supporting `.pdf`, `.docx`, and `.doc` up to 5 MB.
   - Dynamic job description parser with real-time requirement extraction.
   - ATS readiness score gauge, matched skills, missing skills, and actionable suggestions.
   - Interview prep view with categorized technical and behavioral questions.

2. **Client-Side Service Layer**:
   - `src/services/api.ts`: Reusable Axios client reading `NEXT_PUBLIC_API_BASE_URL` or `NEXT_PUBLIC_API_URL`.
   - Automatic bearer token attachment from client session storage.
   - Standardized `ApiClientError` normalization for network, timeout, and HTTP status codes.
   - Reusable React hooks (`useAuth`, `useAuthContext`) and storage utilities (`src/store/`).

3. **Privacy & Security**:
   - Private LLM provider keys and database credentials are never bundled into the client bundle.
   - All external AI processing and persistence are delegated to the backend.

---

## 3. Backend Responsibilities (`backend/`)

1. **Request Pipeline & Middleware**:
   - `helmet()` for secure HTTP headers.
   - Strict CORS whitelist checking against configured `FRONTEND_URL`.
   - In-memory rate limiting for sensitive endpoints (analysis generation and authentication).
   - Global 120s timeout guard preventing hung AI upstream requests from leaking connections.
   - Centralized error handling converting operational errors to clean JSON responses (`ApiError`).

2. **File Processing & Resume Parsing**:
   - `multer` memory storage for multi-part uploads (zero disk leakage).
   - File signature sniffing (`sniffType`) ensuring renamed files cannot spoof PDF or DOCX formats.
   - Standalone buffer translation resolving Node buffer pool offset discrepancies in `pdf-parse`.
   - Clean UTF-8 text extraction and whitespace normalization.

3. **Domain & AI Services**:
   - `llmProvider.js`: Pluggable AI engine supporting Anthropic (`claude-opus-5-5`, etc.) and Google Gemini.
   - Strict Zod schema validation ensuring LLM outputs conform exactly to domain types.
   - `atsService.js` & `scoringService.js`: Deterministic scoring algorithms providing explainable metrics.
   - `analysisRepository.js`: Prisma ORM persistence layer isolating database logic from controllers.

---

## 4. Security & Data Protection

| Concern | Implementation |
|---|---|
| **API Keys & Secrets** | Kept strictly in `backend/.env`. Never surfaced to client code. |
| **CORS** | Explicit origin validation against `FRONTEND_URL`. |
| **Upload Safety** | In-memory processing, strict size limits (5 MB), and magic-byte sniffing. |
| **Authentication** | Passwords hashed with `bcryptjs` (salt rounds: 12), sessions via signed JWTs. |
| **Prompt Injection** | Sanitization utility cleans untrusted resume and job description text before template interpolation. |
