# Phase 11 — ATS Readiness, Resume Validation, Role Fit & Writing Assistant

A transparent ATS readiness score with a ranked action plan, deterministic document checks with
safe mechanical fixes, evidence-based role suitability, and an in-editor writing assistant — all on
top of the Phase 8 resume versions. Everything except the assistant is computed with no AI at all,
and the assistant may not write to the resume: it returns drafts the user inserts.

## Database changes (`backend/prisma/migrations/20261024000000_phase11_resume_builder_ats/`, additive, 13 statements, 2 tables)

| Model (table) | Purpose / constraints |
|---|---|
| `ResumeAtsAssessment` (`api_resume_ats_assessments`) | One saved ATS run: `mode` (`general` \| `job`), `overallScore`, `label`, `categories` / `findings` / `keywordCoverage` / `skills` / `weights` (Json), `jobTitle`, `targetRole`, `templateId`, `method`. Indexes `(userId, createdAt)` and `(versionId, mode, createdAt)` so the general and job trends are read apart. Cascades on user and version delete; `jobDescriptionId` is `SetNull`. |
| `ResumeRoleRecommendation` (`api_resume_role_recommendations`) | One saved role run: `roles` (Json), `careerLevel`, `selectedRole` (set when the user targets one), `method`. Indexes `(userId, createdAt)`, `(versionId, createdAt)`. Cascades on user and version delete. |

`api_resume_improvements` gained the presentation fields the richer suggestion cards need —
`suggestionGroup`, `priority` (default `medium`), `title`, `issue`, `benefit` and
`regenerationCount` — all nullable or defaulted, so Phase 8 rows stay valid and fall back to the
text computed at read time.

```bash
cd backend && npx prisma generate && npx prisma migrate deploy
```

## ATS readiness (`ats-readiness-1.0`, `backend/src/services/resumeBuilder/atsScoringService.js`, pure)

Seven weighted categories, summing to 100 when all apply:

| Category | Weight | What it reads |
|---|---|---|
| `keywords` | 25 | Job keywords present in the text (**job mode only**) |
| `skills` | 20 | Skills alignment against the job or the role baseline |
| `structure` | 15 | Required sections present and filled, conventional headings |
| `relevance` | 15 | Experience and project bullets that use the expected skills |
| `readability` | 10 | Bullet length, paragraph walls, duplicate bullets, weak verbs |
| `formatting` | 10 | Date consistency, decorative symbols, parsing compatibility |
| `contact` | 5 | Name, email, phone, location, links |

Rules the engine holds to:

- **No job description means general readiness.** The `keywords` category is dropped and the
  remaining weights re-normalise — a keyword score is never guessed from nothing.
- **A missing keyword is a keyword gap, not a missing skill.** `keywordCoverage.detail` is
  three-valued per skill: `demonstrated` (used in an entry) beats `listed` (named in the skills
  section) beats `absent`, and the wording says so.
- **Keyword stuffing is penalised**, not rewarded: a very long skill list and repeated terms lose
  points instead of gaining them.
- **Weights are configurable** per request; the response reports the weights it actually used.
- **The action plan is ordered** by priority, then by the points still available in the category it
  belongs to, so the first item is the one worth most. `headroom` lists the points each category
  still has on the table.
- `parsingGuarantees` states what the builder's own PDF export guarantees (real selectable text,
  single column, no text in images) and whether the chosen template renders in ATS mode.
- Bands: 90+ Excellent · 75–89 Strong · 60–74 Good · 40–59 Needs work · < 40 Weak. Every category
  carries its own `explanation`, `pointsEarned` and `pointsLost`.
- `ATS_DISCLAIMER` is returned with every assessment: ATS vendors differ and none publish their
  parsers, so the score is a checklist, not a verdict.

`resolveJobKeywords` prefers the job description's parsed `extractedRequirements.skills` and falls
back to a catalog scan of the raw text, so a pasted description with no parsed requirements still
produces keywords.

### Templates

The six Phase 8 templates keep their ids and now declare their ATS posture: `minimal_ats`
("ATS Classic") and `classic` ("Executive / Corporate") are `atsSafe`; `modern`, `technical`,
`fresher` and `experienced` are not, and say what they are best for. Section order is stable per
template, unknown section types stay last, and a template with no order of its own keeps the user's.
`formatting.atsMode` drops accent colour and decorative rules on *any* template, and every template
renders selectable A4 text — including long names, long URLs and long descriptions, which wrap
rather than clip.

## Validation and safe fixes (`resume-validation-1.0`, `resumeValidationService.js`, pure)

Findings carry `severity`, `title`, `detail`, `action`, their address (`sectionId` / `entryId` /
`field`) and either an `autoFix` or a `question`:

- **Spelling** against a fixed list of common misspellings — never a correctly spelled word (a test
  asserts no entry of the list is itself correct). It is not a dictionary and will miss errors.
- **Duplication** of bullets and skills, **readability** (paragraph walls), **dates** (unparseable
  formats, current-with-end-date, end-before-start), **links** (malformed only — nothing is
  fetched), **decorative symbols**, **stray whitespace**, **unconventional headings** and **empty
  visible sections**.
- **Questions, not inventions.** A bullet with no numbers is *asked* about ("do you know any real
  figures — users served, time saved, volume handled, team size?"); a project that does not say what
  the user personally did is asked about. No metric is ever auto-filled.

Nine fixes (`AUTO_FIXES`) are mechanical, pure and idempotent: `dedupe_skills`, `dedupe_bullets`,
`normalise_dates`, `fix_current_dates`, `strip_symbols`, `trim_whitespace`, `fix_spelling`,
`rename_heading`, `hide_empty_sections`. Each reports `changed: false` honestly for a no-op rather
than writing a pointless version, `normalise_dates` never invents a month and reports what it could
not parse, `rename_heading` only accepts conventional headings for that section type, and
`availableAutoFixes` previews only the fixes that would actually change something.
`end-before-start` has **no** automatic fix — only the user knows which date is wrong. Applying a
fix returns the real ATS score before and after, so the user sees the actual movement rather than a
promised one.

## Role suitability (`role-fit-1.0`, `roleRecommendationService.js`, pure)

Ten roles (frontend, backend, full stack, software engineer, data analyst, React, Python, Java,
QA/test, DevOps/platform), each scored out of 100 from four weighted components: core skills
demonstrated 55, supporting skills 20, experience and projects using them 15, headline / education /
certifications 10.

- Roles below **35%** suitability are **not returned** — they are listed as `belowThreshold` with
  their score instead of being dressed up as recommendations. An empty resume gets no
  recommendations and is told why.
- **No salary, demand or hiring-probability claim** is made anywhere: there is no verified data
  source for them in this product, so none is estimated (a test asserts the absence).
- A **stated preference** from the career profile surfaces a role and marks it `isPreferred`, but
  cannot manufacture evidence for it — the score still comes from the resume.
- **In-progress learning** (from Phase 7 tasks) is shown as in progress and never counted as
  demonstrated.
- **Career level** is inferred (`student` / `fresher` / `junior` / `mid` / `experienced`) from the
  employment entries and education text, and reorders the recommended sections — education and
  projects lead for a fresher whatever the role normally prefers.
- Each role explains itself: `reasons`, matching skills, skills needing evidence, skills to develop,
  the specific projects and experience entries it was read from, a recommended template and section
  order, and learning tasks with verified Phase 7 resources.
- `POST …/target-role` saves the role onto the career profile (`findRole` accepts a title or a
  catalog id and rejects anything else), records it as the selected role on the recommendation, and
  optionally applies the template and section order. The read-only original is never modified; the
  response says so in `readOnlySkipped`.

## Writing assistant (`resume-assistant-1.0`, `resumeAssistantService.js`, the only AI route here)

Nine intents: `improve_summary`, `improve_text`, `rewrite_clearly`, `describe_contribution`,
`suggest_skills`, `preserve_meaning`, `suggest_questions`, `explain_weakness`, `freeform`. Each
declares the section types it applies to, and asking for one against the wrong section type is a 400
rather than a silent re-interpretation.

- **Scope is respected**: the assistant is given the chosen field, else the chosen section, else the
  whole resume, and a draft for a field outside that scope is discarded.
- **Drafts only.** The reply is prose plus zero or more drafts, each addressed to exactly one field.
  Nothing is stored and nothing is written to the resume; the client inserts a draft when the user
  clicks, so not accepting is the same as never asking.
- **Fabrication guard**: drafts are run through the same `fabricationCheck` as Phase 8 suggestions,
  so a draft smuggling in a new number, employer or technology is withheld and reported in
  `rejectedDrafts` with its reason.
- `describe_contribution` with unclear text, `suggest_questions` and `explain_weakness` return
  **questions and explanation, never draft text**.
- `suggest_skills` separates skills the resume already evidences from skills the user would have to
  learn, and never presents an unevidenced skill as theirs.
- **Prompt injection** inside resume content or a job description does not change behaviour: the text
  arrives as untrusted data inside tags and is treated as content to work on (a test asserts this).

## Frontend (Next.js App Router)

`/dashboard/resume-builder/[versionId]` gains four panels in the editor's tab bar —
**Assistant**, **ATS score**, **Checks** and **Roles** — beside the Phase 8 Edit / Template /
AI improve / Tailor / Quality / Versions tabs:

- `ATSScorePanel` + `ATSIssueList` — the ring score with its delta against the last saved run, the
  weighted category breakdown, keyword and skill evidence, section completeness, parsing facts, and
  the ranked action plan with one-click safe fixes. General and job runs are switched in the panel
  and trended separately.
- `ResumeValidationPanel` — counts, the available safe fixes with their previews, the questions only
  the user can answer, and the findings filtered by all / high / auto-fixable / questions. The real
  before/after ATS score of the last applied fix is shown, including "nothing to do".
- `RoleRecommendationPanel` — role cards with suitability, the component breakdown, three-valued
  skill evidence (demonstrated / listed only / not shown), the entries each score was read from, the
  learning gap, and targeting a role with optional template and section-order changes.
- `ResumeAssistantPanel` — intent and scope pickers, the thread, and editable drafts with
  insert/copy. Questions and withheld drafts are shown as prominently as the drafts themselves.

Every derived panel knows when its numbers predate the current text: the page counts content
revisions and each panel records the revision it ran against, so a stale score says so instead of
looking fresh. Service layer: `frontend/src/services/resumeBuilderService.ts`; shared types and the
assistant thread type in `frontend/src/components/resume-builder/types.ts`.

## Tests

- `backend/tests/phase11.test.js` (42 tests): templates and PDF rendering (ids, ATS posture, section
  order, selectable text, long values); ATS weights, general vs job mode, keyword gaps vs missing
  skills, stuffing penalty, three-valued evidence, configurable weights, action-plan ordering,
  keyword resolution; validation across spelling / duplication / dates / links / symbols, questions
  vs fixes, auto-fix idempotency and no-ops, date parsing and comparison, fix previews, the
  misspelling-list invariant; role suitability weighting and threshold, the absence of salary/demand
  claims, empty resumes, preferences without evidence, in-progress learning, career-level section
  order, `findRole` validation; assistant scope, unchanged and fabricated drafts, advisory intents,
  suggestion grouping; and over HTTP: ats-check with snapshot + delta + mode separation, apply-fix
  with real score movement and the read-only original refused, role recommendations persisted and
  role selection saved, assistant scope and no writes, suggestion priority / group / regeneration,
  the action plan's safe fixes actually raising the score, tailoring keeping the original untouched,
  auth and cross-user refusal on every endpoint, empty / oversized input, and prompt injection.
- Full backend suite: 13/13 files pass. Frontend: `tsc` clean, `next build` succeeded (41 routes).

## Limitations (honest)

- Spelling is a fixed misspelling list, not a dictionary: it misses errors and never flags a
  correctly spelled word. Links are checked for malformation only — nothing is fetched, so a
  well-formed dead link is not detected.
- The ATS score describes the resume text. Real ATS parsers are proprietary and differ, so no score
  predicts how a specific system will parse the file or whether a recruiter will shortlist it.
- Role suitability covers ten catalog roles; a role outside the catalog cannot be scored, and
  `target-role` rejects anything not in it.
- No salary, demand, competition or hiring-probability figure is produced anywhere, by design.
- `end-before-start` dates, missing metrics and unclear contributions have no automatic fix, because
  fixing them needs a fact only the user has.
- The assistant needs a configured AI provider; the score, the checks and the role list do not.
- Frontend has no test runner (unchanged); the panels are verified by `tsc`, `next build` and the
  backend HTTP tests of the same endpoints. There is no `live-e2e-phase11.mjs` yet — the Phase 11
  endpoints are covered by the in-process HTTP tests only.
