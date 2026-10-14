import { test } from "node:test";
import assert from "node:assert/strict";
import { analyticsMetrics, overviewMetrics, rangeToFrom, recommendedActions, skillGaps, weekKey, monthKey } from "../src/services/dashboard/dashboardService.js";

const NOW = new Date("2026-10-14T12:00:00Z");
const d = (daysAgo) => new Date(NOW.getTime() - daysAgo * 86400000);

const aiResult = (missing) => ({ matchScore: 70, missingOrUnverifiedSkills: missing.map((m) => (typeof m === "string" ? { name: m, priority: "unknown" } : m)) });

const analyses = [
  { id: "1", analysisMode: "ai", matchScore: 80, provider: "gemini", model: "m1", createdAt: d(2), jobTitle: "A", result: aiResult(["GraphQL", { name: "AWS", priority: "required" }]) },
  { id: "2", analysisMode: "ai", matchScore: 60, provider: "gemini", model: "m1", createdAt: d(40), jobTitle: "B", result: aiResult(["GraphQL"]) },
  { id: "3", analysisMode: "demo", matchScore: 95, createdAt: d(1), jobTitle: "Demo", result: { matchScore: 95, missingOrUnverifiedSkills: [{ name: "Demo gap" }] } },
  { id: "4", analysisMode: "ai", matchScore: 0, createdAt: d(3), jobTitle: "C", result: { matchScore: null, missingOrUnverifiedSkills: [] } }, // insufficient evidence
];
const applications = [
  { id: "a", status: "APPLIED", applicationDate: d(5), nextFollowUpDate: d(1), companyName: "Acme", jobTitle: "FE" },
  { id: "b", status: "INTERVIEW", applicationDate: d(20), nextFollowUpDate: new Date(NOW.getTime() + 3 * 86400000), companyName: "Globex", jobTitle: "BE" },
  { id: "c", status: "REJECTED", applicationDate: d(100), nextFollowUpDate: d(50), companyName: "Initech", jobTitle: "X" },
  { id: "d", status: "INTERESTED", applicationDate: d(2) }, { id: "e", status: "INTERESTED", applicationDate: d(2) }, { id: "f", status: "INTERESTED", applicationDate: d(2) },
];
const interviews = [
  { id: "i1", status: "completed", completedQuestionCount: 5, score: 80, createdAt: d(4), completedAt: d(4) },
  { id: "i2", status: "in_progress", completedQuestionCount: 1, createdAt: d(1) },
];
const resumes = [{ id: "r1" }];

test("overview counts only AI analyses with a computed score in the average and excludes demo/null scores", () => {
  const m = overviewMetrics({ resumes, analyses, applications, interviews, now: NOW });
  assert.equal(m.totals.analyses, 4);
  assert.equal(m.totals.aiAnalyses, 3);
  assert.equal(m.totals.demoAnalyses, 1);
  assert.equal(m.averageMatchScore.value, 70); // (80+60)/2 — demo 95 and null-score excluded
  assert.equal(m.averageMatchScore.sampleSize, 2);
  assert.equal(m.bestMatchScore, 80);
  assert.equal(m.totals.activeApplications, 5);
  assert.equal(m.totals.interviewsCompleted, 1);
  assert.equal(m.followUps.dueSoon, 2); // a (overdue) and b (in 3 days); c is rejected
  assert.equal(m.followUps.overdue, 1);
  assert.equal(m.learningProgress.questionsPracticed, 5);
  assert.equal(m.learningProgress.averageScore, 80);
});

test("overview with no records yields zeros and null average, never invented data", () => {
  const m = overviewMetrics({ resumes: [], analyses: [], applications: [], interviews: [], now: NOW });
  assert.equal(m.totals.analyses, 0);
  assert.equal(m.averageMatchScore.value, null);
  assert.equal(m.bestMatchScore, null);
  assert.equal(m.learningProgress, null);
});

test("skill gaps aggregate AI analyses only and rank by frequency then required count", () => {
  const gaps = skillGaps(analyses);
  assert.deepEqual(gaps.map((g) => g.name), ["GraphQL", "AWS"]);
  assert.equal(gaps[0].count, 2);
  assert.equal(gaps[1].required, 1);
  assert.ok(!gaps.some((g) => g.name === "Demo gap"), "demo analyses must not feed skill gaps");
});

test("recommended actions are derived from the user's records", () => {
  const empty = recommendedActions({ resumes: [], analyses: [], applications: [], jobDescriptions: [], interviews: [], now: NOW });
  assert.equal(empty[0].key, "upload-resume");
  const full = recommendedActions({ resumes, analyses, applications, jobDescriptions: [], interviews, now: NOW });
  const keys = full.map((a) => a.key);
  assert.ok(keys.includes("follow-ups"));
  assert.ok(keys.includes("apply"));
  assert.ok(keys.includes("skill-gaps"));
  assert.ok(full.length <= 5);
});

test("analytics buckets by week/month, respects range, flags insufficient history and mixed scoring methods", () => {
  const a = analyticsMetrics({ analyses, applications, interviews, range: "30d", now: NOW });
  assert.equal(a.granularity, "week");
  assert.equal(a.scoreTrend.length, 1, "only the AI analysis inside 30d with a score");
  assert.equal(a.insufficientHistory, true);
  assert.equal(a.sampleSizes.applications, 5);
  assert.equal(a.applicationsOverTime.reduce((s, b) => s + b.count, 0), 5);
  assert.equal(a.statusDistribution.find((s) => s.status === "INTERESTED").count, 3);

  const b = analyticsMetrics({ analyses, applications, interviews, range: "12m", now: NOW });
  assert.equal(b.granularity, "month");
  assert.equal(b.scoreTrend.length, 2);
  assert.equal(b.insufficientHistory, false);
  assert.match(b.scoreTrendNote, /comparable only while/);
  assert.equal(b.skillGaps[0].name, "GraphQL");

  const mixed = analyticsMetrics({ analyses: [...analyses, { id: "5", analysisMode: "ai", matchScore: 50, provider: "anthropic", model: "m2", createdAt: d(1), result: { matchScore: 50, missingOrUnverifiedSkills: [] } }], applications, interviews, range: "all", now: NOW });
  assert.match(mixed.scoreTrendNote, /may not be directly comparable/);
  assert.ok(mixed.weekly.analyses.length >= 1 && mixed.monthly.applications.length >= 1);
});

test("date helpers", () => {
  assert.equal(weekKey(new Date("2026-10-14T10:00:00")), "2026-10-12"); // Wednesday → Monday
  assert.equal(monthKey(new Date("2026-10-14")), "2026-10");
  assert.equal(rangeToFrom("all"), null);
  assert.equal(Math.round((NOW - rangeToFrom("7d", NOW)) / 86400000), 7);
});
