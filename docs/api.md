# Backend REST API Reference

The backend exposes a structured, RESTful API mounted at `/api`.

All endpoints return JSON responses with standardized error envelopes.

---

## Error Response Format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable error description",
    "details": [
      { "field": "email", "message": "Invalid email address format" }
    ],
    "retryable": false
  }
}
```

---

## 1. System Health

### `GET /api/health`
Checks server readiness, database connectivity state, and configured LLM provider status.

- **Auth Required**: No
- **Response** (`200 OK`):
  ```json
  {
    "status": "ok",
    "ai": {
      "configured": true,
      "provider": "anthropic",
      "model": "claude-opus-5-5"
    },
    "time": "2026-10-13T10:00:00.000Z"
  }
  ```

---

## 2. Authentication

### `POST /api/auth/register`
Creates a new user account with hashed password.

- **Auth Required**: No
- **Request Body**:
  ```json
  {
    "email": "user@example.com",
    "password": "StrongPassword123!",
    "name": "Jane Doe"
  }
  ```
- **Response** (`201 Created`):
  ```json
  {
    "user": {
      "id": "cly12345...",
      "email": "user@example.com",
      "name": "Jane Doe",
      "createdAt": "2026-10-13T10:00:00.000Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
  ```

### `POST /api/auth/login`
Authenticates existing credentials and issues a JWT token.

- **Auth Required**: No
- **Request Body**:
  ```json
  {
    "email": "user@example.com",
    "password": "StrongPassword123!"
  }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "user": {
      "id": "cly12345...",
      "email": "user@example.com",
      "name": "Jane Doe"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
  ```

### `GET /api/auth/me`
Fetches the currently authenticated profile.

- **Auth Required**: Yes (`Authorization: Bearer <token>`)
- **Response** (`200 OK`):
  ```json
  {
    "user": {
      "id": "cly12345...",
      "email": "user@example.com",
      "name": "Jane Doe"
    }
  }
  ```

---

## 3. Resume Processing

### `POST /api/resume/parse`
Extracts raw text and metadata from uploaded PDF or Word document in memory.

- **Auth Required**: No (supports demo uploads)
- **Content-Type**: `multipart/form-data`
- **Fields**:
  - `resume`: File (`.pdf`, `.docx`, `.doc`, max 5 MB)
- **Response** (`200 OK`):
  ```json
  {
    "text": "Extracted text content from the resume...",
    "charCount": 2450,
    "mimeType": "application/pdf",
    "fileName": "resume.pdf",
    "fileSize": 124500
  }
  ```

---

## 4. Resume & Job Analysis

### `POST /api/analysis/run`
Executes full AI-powered analysis comparing a resume against a target job description.

- **Auth Required**: Optional (logged-in users have results automatically persisted)
- **Rate Limit**: 10 requests per 15 minutes per IP
- **Request Body**:
  ```json
  {
    "resumeText": "Full plain text of the resume...",
    "jobDescription": "Full job description text...",
    "jobTitle": "Senior Frontend Engineer",
    "targetRole": "frontend"
  }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "id": "cly67890...",
    "matchScore": 84,
    "atsScore": 88,
    "summary": "Strong alignment with frontend requirements...",
    "matchedSkills": [
      {
        "name": "React",
        "category": "Frontend",
        "priority": "required",
        "evidence": "Built design system in React 18",
        "evidenceType": "direct"
      }
    ],
    "missingOrUnverifiedSkills": [
      {
        "name": "GraphQL",
        "category": "Backend",
        "priority": "required",
        "reason": "Not found in resume text"
      }
    ],
    "strengths": [
      "Quantified lighthouse optimization"
    ],
    "improvementSuggestions": [
      {
        "title": "Add state management details",
        "description": "Specify experience with Redux or Zustand",
        "type": "content",
        "priority": "high"
      }
    ],
    "interviewQuestions": [
      {
        "question": "How do you optimize React render cycles?",
        "topic": "React Performance",
        "type": "technical",
        "difficulty": "hard"
      }
    ]
  }
  ```

### `GET /api/analysis/history`
Returns previously saved analyses for the authenticated user.

- **Auth Required**: Yes (`Authorization: Bearer <token>`)
- **Query Params**:
  - `limit`: Integer (default: 20, max: 50)
  - `cursor`: Pagination cursor

### `GET /api/analysis/:id`
Retrieves a single analysis by its ID.

- **Auth Required**: Yes
- **Response** (`200 OK`): Full analysis object.

### `DELETE /api/analysis/:id`
Deletes an analysis owned by the authenticated user.

- **Auth Required**: Yes
- **Response** (`204 No Content`)

## Learning roadmaps (Phase 7)

All routes live under `/api/learning` and require `Authorization: Bearer <jwt>`; every record is scoped to the owner (404 otherwise). The full request/response reference, status codes and derivation rules are in [phase7.md](phase7.md).

| Method | Path | Notes |
|---|---|---|
| POST | `/api/learning/roadmaps` | AI generation (long request budget, AI rate limiter) |
| GET | `/api/learning/roadmaps` | `status`, `page`, `limit` |
| GET / PATCH / DELETE | `/api/learning/roadmaps/:id` | |
| POST | `/api/learning/roadmaps/:id/regenerate` | `apply=false` preview (default) / `apply=true` new version |
| GET | `/api/learning/roadmaps/:id/progress` | progress, weekly plan, next action |
| GET | `/api/learning/roadmaps/:id/tasks` | `status`, `milestoneId` |
| PATCH | `/api/learning/tasks/:taskId` | status / notes / schedule / study minutes |
| POST | `/api/learning/tasks/:taskId/complete` · `/reopen` | |
| GET | `/api/learning/tasks/:taskId/resources` | |
| POST | `/api/learning/tasks/:taskId/checkpoints/:checkpointId/submit` | MCQ graded server-side; other types self-reported |
| GET | `/api/learning/skill-gaps` · PATCH `/api/learning/skill-gaps/:id` | |
| GET | `/api/learning/recommendations` · POST `/api/learning/recommendations/:key/dismiss` | |
