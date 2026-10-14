# Local Setup & Development Guide

Follow this guide to get the full-stack AI Resume Analyzer up and running locally.

---

## Prerequisites

- **Node.js**: v18.12.0 or newer (`node -v`)
- **npm**: v9.0.0 or newer (`npm -v`)
- **PostgreSQL**: Local instance or hosted provider (Supabase, Neon, Railway)

---

## 1. Installation

Install dependencies across the monorepo using the root convenience script:

```bash
# From repository root:
npm run install:all
```

Or manually install each service:

```bash
# Root helper dependencies (concurrently)
npm install

# Frontend dependencies
npm --prefix frontend install

# Backend dependencies
npm --prefix backend install
```

---

## 2. Environment Configuration

### Frontend (`frontend/.env`)
Copy the example file:
```bash
cp frontend/.env.example frontend/.env
```

Contents:
```env
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
```

### Backend (`backend/.env`)
Copy the example file:
```bash
cp backend/.env.example backend/.env
```

Key variables to configure:
```env
PORT=4000
NODE_ENV=development
FRONTEND_URL=http://localhost:3001

# PostgreSQL connection string
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/resume_analyzer?schema=public"

# Session JWT secret (min 32 chars)
JWT_SECRET="replace-with-a-random-secret-at-least-32-chars-long"
JWT_EXPIRES_IN=7d

# AI Provider ("anthropic" or "gemini")
LLM_PROVIDER=anthropic
LLM_API_KEY="your-llm-api-key-here"
LLM_MODEL="claude-opus-5-5"
```

---

## 3. Database Initialization

Generate the Prisma client and apply migrations:

```bash
# Generate Prisma Client:
npm run db:generate

# Apply migrations:
npm run db:migrate
```

---

## 4. Running the Application

### Option A: Run Both Services Concurrently (Recommended)
```bash
npm run dev
```
- **Frontend**: http://localhost:3001
- **Backend API**: http://localhost:4000
- **Health Check**: http://localhost:4000/api/health

### Option B: Run Services Individually
```bash
# Start frontend only (port 3001)
npm run dev:frontend

# Start backend only (port 4000)
npm run dev:backend
```

---

## 5. Running Tests

```bash
# Backend test suite (Node test runner)
npm test

# Frontend type validation & build
npm run build
```
