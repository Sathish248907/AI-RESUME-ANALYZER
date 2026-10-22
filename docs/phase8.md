# Phase 8 — AI Resume Improvement Assistant & Resume Builder

Signed-in users edit a structured copy of an uploaded resume (or start from scratch), get grounded
AI rewrite suggestions, tailor the content to a job description, run deterministic quality checks,
manage versions, compare and restore them, and download an A4 PDF with real text. The uploaded file
and its extracted text are never modified. No AI credentials reach the browser.

## Database changes (`backend/prisma/migrations/20261021000000_phase8_resume_builder/`, additive, 13 statements)

| Model (table) | Notes |
|---|---|
| `ResumeVersion` (`api_resume_versions`) | Owner (`userId`), optional `resumeId` (SetNull on upload delete) and `jobDescriptionId` (SetNull), `parentVersionId`, `name`, `versionNumber` (per resume), `kind` (`original` \| `improved` \| `tailored` \| `custom` \| `restored`), `isOriginal`, `templateId`, `content` (Json, see below), `formatting` (Json), `contentSource` (`manual` \| `heuristic` \| `ai` \| `duplicate` \| `restore`), `targetJobTitle`, `targetCompany`, `lastQualityScore`. Indexes `(userId, updatedAt)`, `(resumeId, versionNumber)`. |
| `ResumeImprovement` (`api_resume_improvements`) | One AI suggestion per field: `versionId`, `batchId`, `mode` (`improve` \| `tailor`), `sectionId`, `entryId`, `field`, `category`, `originalText`, `suggestedText`, `rationale`, `needsConfirmation`, `confirmationQuestion`, `status` (`pending` \| `accepted` \| `rejected` \| `edited`), `acceptedText`, `resolvedAt`. Cascade on version delete. |
| `ResumeTemplatePreference` (`api_resume_template_preferences`) | One per user: default `templateId` + `formatting` for new versions. |

`User` gained `resumeVersions` and `templatePreference`; `Resume` and `JobDescription` gained `versions` /
`resumeVersions` relations. **Sections are not a separate table**: a resume's ordered sections live in
the version's `content` JSON (`resume-content-1.0`, validated by Zod on every write) because they are
always loaded and saved together; searchable metadata (name, kind, template, target job, quality
score) stays in columns.

```bash
cd backend && npx prisma generate && npx prisma migrate deploy   # applied 2026-10-22
```

### Content document (`backend/src/services/resumeBuilder/resumeContentSchema.js`)

```
{ personal: { fullName, title, email, phone, location, website, linkedin, github },
  sections: [ { id, type, title, visible, ...payload } ] }
```
Payload by type: `summary.text`; `skills.groups[{id,name,items[]}]`; `experience.entries[{id,role,company,location,startDate,endDate,current,bullets[]}]`;
`projects.entries[{id,name,role,technologies[],link,startDate,endDate,bullets[]}]`; `education.entries[{id,degree,institution,location,startDate,endDate,details[]}]`;
`certifications.entries[{id,name,issuer,date,link}]`; `achievements|languages|custom.items[]`. Limits: 25 sections, 40 bullets per entry, 400 chars per line, ~120 KB per document.
Every entry has a stable id so suggestions, diffs and the preview highlight can target one field.

## Services (all under `backend/src/services/resumeBuilder/`)

- **resumeStructureService.js** — `structureHeuristically(text)` (headings, bullets, dates, contact
  detection; no network) and `structureWithAi(llm, text)` (schema `resume_structure`, model must copy
  verbatim; output is checked against the source and rejected with `502 LLM_INVALID_OUTPUT` when more
  than ~20 % of bullets are rephrased).
- **resumeImprovementService.js** (`resume-improve-1.0`) — `generateImprovements` (schema
  `resume_improvements`) and `generateTailoring` (schema `resume_tailoring`). Prompts fence the resume
  and job description as untrusted data and omit contact details. Post-processing drops suggestions
  for unknown/unchanged fields and runs the **fabrication guard**: numbers, years and catalog
  technologies that do not appear anywhere in the resume mark the suggestion `needsConfirmation` with
  a question for the user. Tailoring keeps `keywordsToAdd` only when the resume already supports the
  keyword; everything else is returned as `genuineGaps`, never written into the resume.
- **resumeQualityService.js** (`resume-quality-1.0`) — deterministic checks in 8 weighted categories
  (contact 10, summary 15, experience 25, projects 10, skills 10, language 15, consistency 10, ATS 5)
  reusing the Phase 4 text ATS checks; job-keyword coverage when a job description is linked. Reported
  separately from the Phase 4 job-match score, with a disclaimer.
- **resumeDiffService.js** (`resume-diff-1.0`) — section / entry / bullet / contact diff with id
  aliasing for re-structured copies, plus a one-line description.
- **resumePdfService.js** — pdfkit renderer: A4, standard-14 fonts (Helvetica / Times / Courier),
  four templates (`modern`, `minimal_ats`, `technical`, `classic`), margins, spacing, heading and
  bullet styles, accent colour, automatic page breaks, page numbers on multi-page output, safe ASCII
  filenames. All strings go through the text API; nothing is interpreted (verified in tests with
  `<script>` and `/JavaScript` payloads).

## API (`/api/resume-builder/*`, all `requireAuth`, owner-scoped → 404 otherwise)

| Method & path | Purpose |
|---|---|
| `GET /templates` · `GET/PUT /preferences` | Template catalog; the user's default template + formatting. |
| `GET /:resumeId` | Editable resume: creates the read-only **original** version on first access (heuristic structure), returns it plus all versions. |
| `POST /:resumeId/versions` | New version from the upload (`structure: heuristic|ai`, reuses the original's structure when present), from `fromVersionId`, or `blank`. AI limiter + long request budget. |
| `GET /:resumeId/versions` · `GET /versions?resumeId=` | List (no content payload). |
| `POST /versions` | Blank / from-version without an upload. |
| `GET /versions/:id` | Full version + pending suggestion count + templates. |
| `PATCH /versions/:id` | Autosave `name`, `content` (validated), `templateId` (re-applies template look), `formatting`, `jobDescriptionId`, target job fields; `expectedUpdatedAt` gives optimistic concurrency (`409 VERSION_CONFLICT`). Recomputes `lastQualityScore`. |
| `POST /versions/:id/duplicate` · `DELETE /versions/:id` | Duplicate (optionally for a job); delete (`409 ORIGINAL_HAS_DERIVED` protects the original while copies exist). |
| `POST /versions/:id/restore` | Copy another version's content into this one; the previous content is kept as a new `restored` backup version. Original is read-only (`409 ORIGINAL_READONLY`). |
| `POST /versions/:id/improve` | AI suggestions (`sectionIds`, `userNotes`). Replaces older pending suggestions of the same mode. `400 EMPTY_RESUME` when nothing to improve. |
| `POST /versions/:id/tailor` | Saved `jobDescriptionId` or pasted `jobDescription` (+ `jobTitle`, `companyName`, `saveJobDescription`), optional `analysisId`. Links the version to the job. |
| `GET /versions/:id/improvements?status=&batchId=` | Suggestion history. |
| `POST /versions/:id/improvements/:improvementId` | `accept` (optional `text`), `edit` (`text`), `reject`, `reset` (reverts the field). Accepting is the only path that writes AI text into the content. |
| `GET /versions/:id/quality-check?jobDescriptionId=` | Quality report; keywords from parsed requirements or catalog terms in the JD text. |
| `POST /versions/:id/compare` | Diff with `otherVersionId` + both quality scores. |
| `POST /versions/:id/export/pdf` | PDF stream (`Content-Disposition: attachment`, `X-Resume-Pages`); `422 EXPORT_INCOMPLETE` without name, contact or any section. Optional `templateId` / `formatting` override. |
| `GET /versions/:id/plain-text` | Plain-text rendering. |

`app.js` adds the AI request budget to `POST /api/resume-builder/versions`, `/:resumeId/versions` and
`/versions/:id/(improve|tailor)`.

## Frontend (Next.js App Router)

- `/dashboard/resume-builder` — hub: uploaded resumes (open working copy / AI-structured copy), all
  versions, start from scratch. Deep link `?resumeId=` from *My resumes* ("Improve").
- `/dashboard/resume-builder/[versionId]` — split-screen editor: left tabs **Edit** (`ResumeEditor`:
  personal details, add/rename/hide/reorder/delete sections, entries, inline bullets with Enter/Backspace),
  **Template** (`ResumeTemplateSelector`), **AI improve** (`AIImprovementPanel` + `SuggestionList`:
  before/after, accept / edit / reject / undo, confirmation prompts), **Tailor to job**
  (`JobTailoringPanel`), **Quality** (`ResumeQualityPanel`), **Versions** (`ResumeVersionHistory`,
  `ResumeComparison`); right `ResumePreview` (A4 HTML mirror, zoom, approximate page-break lines,
  one-page overflow warning, highlight of the field a suggestion targets). Debounced autosave with
  saving / saved / unsaved / error states and retry, optimistic-concurrency conflicts surfaced,
  undo / redo (Ctrl+Z / Ctrl+Y), Ctrl+S flush, `beforeunload` guard, `PDFExportButton` (flushes first).
- Navigation: Navbar "Resume Builder", dashboard quick link, *My resumes* "Improve" button, analysis
  detail "Improve this resume". `APP_ROUTES.RESUME_BUILDER*` / `API_ROUTES.RESUME_BUILDER*`.
- Service: `frontend/src/services/resumeBuilderService.ts`. Axios interceptor now decodes JSON error
  bodies returned as Blobs (PDF export errors).

## Dependencies

- backend: `pdfkit@0.15.2` (PDF generation). No frontend dependencies added.

## Tests

- `backend/tests/phase8.test.js` (12 tests, fake Prisma + fake LLM): heuristic structuring, AI
  structure grounding, fabrication guard + keyword support + post-processing, quality scoring and
  explanations (empty / weak / strong), diff + description, PDF (text in all templates, multi-page
  with page numbers, hostile content, filenames), content schema validation; HTTP: original creation
  and read-only rules, create/edit/autosave conflict/formatting/template defaults/duplicate/compare/
  restore/delete rules/blank/preferences, AI structuring accepted vs rejected vs timeout (nothing
  persisted), improve (contact details not sent, suggestions stored separately, accept/edit/reject/
  reset, scoped regeneration, empty resume 400, malformed output), tailor (saved vs pasted JD,
  unsupported keywords become gaps, version linking), quality endpoint, PDF export headers/content/
  validation, full ownership matrix, SetNull on upload delete.
- `backend/tests/live-e2e-phase8.mjs` — live probe (two Gemini calls) passed 2026-10-22 against Neon +
  `gemini-flash-lite-latest`: upload → original → working copy → autosave + conflict → improve (one
  suggestion flagged for confirmation) → accept → reset → tailor (keywords vs genuine gaps) → quality →
  compare → duplicate → PDF (1 page, text extractable) → cleanup.

## Limitations (honest)

- The HTML preview mirrors the PDF layout but browser and PDF text metrics differ slightly, so the
  dashed page-break lines are approximate; the PDF is authoritative.
- Fonts are the PDF standard 14 (Helvetica, Times, Courier) — no custom font embedding.
- Spelling checks use a small misspelling list, not a dictionary; grammar is not checked beyond
  pronoun / verb heuristics.
- AI structuring (`structure: "ai"`) is strict by design and may reject a model that paraphrases; the
  heuristic structure is the default and always available.
- Suggestions are field-level rewrites. Reordering, adding or removing entries is manual.
- Frontend has no test runner (as before); behaviour is verified by `tsc`, page compilation, the
  production build and backend HTTP tests of the same endpoints.
