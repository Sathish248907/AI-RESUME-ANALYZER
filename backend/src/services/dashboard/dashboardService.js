/**
 * dashboardService.js — pure metric calculations over a user's records.
 * All functions take plain arrays (already filtered to one user) and return
 * plain data, so they are unit-testable without a database.
 *
 * Nothing here invents data: empty inputs produce zeros / empty arrays, and
 * averages are reported with the sample size so the UI can show "n/a".
 */
import { ACTIVE_STATUSES, APPLICATION_STATUSES } from "../../models/applicationRepository.js";

const DAY = 24 * 60 * 60 * 1000;

export function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function localDateKey(x) {
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

/** Monday-based week start, as YYYY-MM-DD (local calendar, timezone-safe). */
export function weekKey(d) {
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return localDateKey(x);
}

export function monthKey(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
}

/** Resolve a range keyword to a `from` date (null = all time). */
export function rangeToFrom(range, now = new Date()) {
  switch (range) {
    case "7d": return new Date(now.getTime() - 7 * DAY);
    case "30d": return new Date(now.getTime() - 30 * DAY);
    case "90d": return new Date(now.getTime() - 90 * DAY);
    case "12m": { const d = new Date(now); d.setMonth(d.getMonth() - 12); return d; }
    default: return null;
  }
}

export function inRange(date, from, to) {
  const t = new Date(date).getTime();
  if (from && t < from.getTime()) return false;
  if (to && t > to.getTime()) return false;
  return true;
}

function average(values) {
  if (values.length === 0) return null;
  return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
}

/** Only AI analyses with a computed score count towards score metrics. */
function scoredAi(analyses) {
  return analyses.filter((a) => a.analysisMode === "ai" && typeof a.matchScore === "number" && a.result?.matchScore !== null);
}

/**
 * Top "missing or unverified" skills across AI analyses.
 * @returns {{ name: string, count: number, required: number }[]}
 */
export function skillGaps(analyses, limit = 10) {
  const map = new Map();
  for (const a of analyses) {
    if (a.analysisMode !== "ai") continue;
    for (const s of a.result?.missingOrUnverifiedSkills ?? []) {
      const key = String(s.name ?? "").trim();
      if (!key) continue;
      const entry = map.get(key.toLowerCase()) ?? { name: key, count: 0, required: 0 };
      entry.count += 1;
      if (s.priority === "required") entry.required += 1;
      map.set(key.toLowerCase(), entry);
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || b.required - a.required || a.name.localeCompare(b.name)).slice(0, limit);
}

export function overviewMetrics({ resumes, analyses, applications, interviews, now = new Date() }) {
  const ai = scoredAi(analyses);
  const activeApps = applications.filter((a) => ACTIVE_STATUSES.includes(a.status));
  const completedInterviews = interviews.filter((i) => i.status === "completed");
  const upcoming = applications
    .filter((a) => a.nextFollowUpDate && new Date(a.nextFollowUpDate).getTime() <= now.getTime() + 14 * DAY && ACTIVE_STATUSES.includes(a.status))
    .sort((a, b) => new Date(a.nextFollowUpDate) - new Date(b.nextFollowUpDate));
  const overdue = upcoming.filter((a) => new Date(a.nextFollowUpDate).getTime() < startOfDay(now).getTime()).length;

  return {
    totals: {
      resumes: resumes.length,
      analyses: analyses.length,
      aiAnalyses: analyses.filter((a) => a.analysisMode === "ai").length,
      demoAnalyses: analyses.filter((a) => a.analysisMode === "demo").length,
      applications: applications.length,
      activeApplications: activeApps.length,
      interviewsCompleted: completedInterviews.length,
      jobDescriptions: undefined, // filled by caller
    },
    averageMatchScore: { value: average(ai.map((a) => a.matchScore)), sampleSize: ai.length, basis: "AI analyses with a computed score" },
    bestMatchScore: ai.length ? Math.max(...ai.map((a) => a.matchScore)) : null,
    followUps: { dueSoon: upcoming.length, overdue },
    learningProgress: completedInterviews.length
      ? {
          questionsPracticed: completedInterviews.reduce((s, i) => s + (i.completedQuestionCount ?? 0), 0),
          averageScore: average(completedInterviews.filter((i) => typeof i.score === "number").map((i) => i.score)),
        }
      : null,
  };
}

/** Rule-based next-action suggestions derived only from the user's own records. */
export function recommendedActions({ resumes, analyses, applications, jobDescriptions, interviews, now = new Date() }) {
  const actions = [];
  const ai = scoredAi(analyses);
  if (resumes.length === 0) actions.push({ key: "upload-resume", title: "Upload your first resume", detail: "Resumes are stored to your account so you can analyse them against many jobs.", href: "/dashboard/my-resumes" });
  if (resumes.length > 0 && ai.length === 0) actions.push({ key: "first-analysis", title: "Run your first AI analysis", detail: "Compare a stored resume against a job description.", href: "/dashboard/resume-analyzer" });
  const overdue = applications.filter((a) => a.nextFollowUpDate && new Date(a.nextFollowUpDate) < startOfDay(now) && ACTIVE_STATUSES.includes(a.status));
  if (overdue.length) actions.push({ key: "follow-ups", title: `${overdue.length} follow-up${overdue.length === 1 ? "" : "s"} overdue`, detail: `Oldest: ${overdue[0].companyName} — ${overdue[0].jobTitle}.`, href: "/dashboard/applications" });
  const interested = applications.filter((a) => a.status === "INTERESTED");
  if (interested.length >= 3) actions.push({ key: "apply", title: `${interested.length} saved jobs not applied to yet`, detail: "Move them forward or withdraw to keep the pipeline honest.", href: "/dashboard/applications" });
  const gaps = skillGaps(analyses, 3);
  if (gaps.length) actions.push({ key: "skill-gaps", title: `Most frequent gap: ${gaps[0].name}`, detail: `Unverified in ${gaps[0].count} analysis${gaps[0].count === 1 ? "" : "es"}. Add evidence to your resume only if you genuinely have it.`, href: "/dashboard/analysis-history" });
  if (jobDescriptions.length === 0 && ai.length > 0) actions.push({ key: "save-jd", title: "Save job descriptions for reuse", detail: "Saved descriptions can be compared against several resumes.", href: "/dashboard/job-descriptions" });
  if (ai.length > 0 && interviews.length === 0) actions.push({ key: "interview", title: "Practise the generated interview questions", detail: "Open an AI analysis and mark questions as practised to track progress.", href: "/dashboard/analysis-history" });
  return actions.slice(0, 5);
}

function bucketize(items, getDate, granularity, from, to) {
  const keyFn = granularity === "month" ? monthKey : weekKey;
  const map = new Map();
  for (const it of items) {
    const d = getDate(it);
    if (!inRange(d, from, to)) continue;
    const k = keyFn(d);
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([period, count]) => ({ period, count }));
}

export function analyticsMetrics({ analyses, applications, interviews, range = "90d", granularity, now = new Date() }) {
  const from = rangeToFrom(range, now);
  const gran = granularity ?? (range === "12m" || range === "all" ? "month" : "week");
  const ai = scoredAi(analyses).filter((a) => inRange(a.createdAt, from, null));

  const scoreTrend = ai
    .slice()
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .map((a) => ({ date: new Date(a.createdAt).toISOString(), score: a.matchScore, jobTitle: a.jobTitle, id: a.id, provider: a.provider ?? null, model: a.model ?? null }));

  const statusDistribution = APPLICATION_STATUSES.map((s) => ({ status: s, count: applications.filter((a) => a.status === s).length }));
  const scoringMethods = [...new Set(ai.map((a) => `${a.provider ?? "unknown"}/${a.model ?? "unknown"}`))];

  const periodTotals = (getItems, getDate) => bucketize(getItems, getDate, gran, from, null);
  const weekly = {
    analyses: bucketize(analyses, (a) => a.createdAt, "week", rangeToFrom("90d", now), null),
    applications: bucketize(applications, (a) => a.applicationDate, "week", rangeToFrom("90d", now), null),
    interviews: bucketize(interviews.filter((i) => i.status === "completed"), (i) => i.completedAt ?? i.createdAt, "week", rangeToFrom("90d", now), null),
  };
  const monthly = {
    analyses: bucketize(analyses, (a) => a.createdAt, "month", rangeToFrom("12m", now), null),
    applications: bucketize(applications, (a) => a.applicationDate, "month", rangeToFrom("12m", now), null),
    interviews: bucketize(interviews.filter((i) => i.status === "completed"), (i) => i.completedAt ?? i.createdAt, "month", rangeToFrom("12m", now), null),
  };

  return {
    range,
    granularity: gran,
    from: from ? from.toISOString() : null,
    sampleSizes: { aiAnalyses: ai.length, analyses: analyses.filter((a) => inRange(a.createdAt, from, null)).length, applications: applications.filter((a) => inRange(a.applicationDate, from, null)).length },
    scoreTrend,
    scoreTrendNote:
      scoringMethods.length > 1
        ? `Scores came from ${scoringMethods.length} different provider/model combinations (${scoringMethods.join(", ")}) and may not be directly comparable.`
        : "Scores are application-defined estimates, not hiring probabilities. They are comparable only while the scoring method and provider stay the same.",
    applicationsOverTime: periodTotals(applications, (a) => a.applicationDate),
    analysesOverTime: periodTotals(analyses, (a) => a.createdAt),
    interviewActivity: periodTotals(interviews.filter((i) => i.status === "completed"), (i) => i.completedAt ?? i.createdAt),
    statusDistribution,
    skillGaps: skillGaps(analyses.filter((a) => inRange(a.createdAt, from, null)), 10),
    weekly,
    monthly,
    insufficientHistory: ai.length < 2,
  };
}
