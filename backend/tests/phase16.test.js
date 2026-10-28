/**
 * Phase 16 — final integration.
 *
 * Two things are under test: the cross-feature recommendation surface (one
 * engine, two dismissal stores reconciled, done-items reopening when the
 * condition recurs) and first-run onboarding (progress only, step completion
 * derived from real records rather than from clicks).
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { loadEnv } from "../src/config/env.js";
import { createApp } from "../src/app.js";
import { TEST_ENV, fakeLlm, fakePrisma } from "./fixtures.js";
import {
  careerKeysForLearningKey,
  groupByType,
  rankRecommendations,
  reconcile,
  suppressedKeys,
} from "../src/services/recommendations/recommendationService.js";
import {
  deriveSatisfied,
  isComplete,
  nextStep,
  ONBOARDING_STEPS,
  profileIsUseful,
  STEP_KEYS,
} from "../src/services/onboarding/onboardingService.js";

let server;
let baseUrl;
let prisma;

async function ensureServer() {
  if (server) return;
  const env = loadEnv(TEST_ENV);
  prisma = fakePrisma();
  const app = createApp({ env, prisma, llm: fakeLlm() });
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
    server.unref();
  });
}

async function api(path, { method = "GET", token, body } = {}) {
  await ensureServer();
  const res = await fetch(baseUrl + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3001",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function registerUser(email) {
  const r = await api("/api/auth/register", { method: "POST", body: { email, password: "password123", name: "Tester" } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.token;
}

after(() => new Promise((r) => (server ? server.close(r) : r())));

// ── Dismissal reconciliation across the two stores ───────────────────────────

test("a learning dismissal key maps onto the career key for the same idea", () => {
  assert.deepEqual(careerKeysForLearningKey("gap:react"), ["skill:react"]);
  assert.deepEqual(careerKeysForLearningKey("weak:closures"), ["interview:weak:closures", "interview:confirm:closures"]);
  assert.deepEqual(careerKeysForLearningKey("resume:task-123"), ["learning:task:task-123"]);
  assert.deepEqual(careerKeysForLearningKey("project:task-9"), ["learning:task:task-9"]);
});

test("keys it does not recognise map to nothing rather than guessing", () => {
  assert.deepEqual(careerKeysForLearningKey("something:else"), []);
  assert.deepEqual(careerKeysForLearningKey("gap:"), []);
  assert.deepEqual(careerKeysForLearningKey(""), []);
});

test("a dismissal in either store suppresses the item", () => {
  const s = suppressedKeys(["gap:react"], [{ key: "resume:upload", status: "dismissed" }, { key: "skill:go", status: "open" }]);
  assert.equal(s.has("skill:react"), true, "learning dismissal should suppress the career twin");
  assert.equal(s.has("resume:upload"), true, "career dismissal should suppress");
  assert.equal(s.has("skill:go"), false, "an open item must not be suppressed");
});

// ── Reconciliation ───────────────────────────────────────────────────────────

const rec = (key, over = {}) => ({
  key, type: "resume", title: `t:${key}`, explanation: "e", reason: "r",
  evidence: [], priority: "medium", effortMinutes: 10, href: "/x", ...over,
});

test("a dismissed item is never written back as live", () => {
  const { toSync } = reconcile([rec("a"), rec("b")], [{ id: "1", key: "a", status: "dismissed" }]);
  assert.deepEqual(toSync.map((r) => r.key), ["b"]);
});

test("a suppressed item is filtered even when it was never stored", () => {
  const { toSync } = reconcile([rec("skill:react")], [], { suppressed: new Set(["skill:react"]) });
  assert.deepEqual(toSync, []);
});

test("an item marked done is reopened when the generator emits it again", () => {
  const { reopenIds } = reconcile([rec("a")], [{ id: "row-1", key: "a", status: "done" }]);
  assert.deepEqual(reopenIds, ["row-1"], "a recurring condition must be surfaced again");
});

test("an item marked done is left alone while the condition is gone", () => {
  const { reopenIds, toSync } = reconcile([rec("b")], [{ id: "row-1", key: "a", status: "done" }]);
  assert.deepEqual(reopenIds, []);
  assert.deepEqual(toSync.map((r) => r.key), ["b"]);
});

test("an open item the generator dropped is reported as closed", () => {
  const { closedKeys } = reconcile([rec("b")], [{ id: "1", key: "a", status: "open" }]);
  assert.deepEqual(closedKeys, ["a"]);
});

// ── Ranking and grouping ─────────────────────────────────────────────────────

test("high priority outranks everything, then the smaller job wins", () => {
  const ranked = rankRecommendations([
    rec("c", { priority: "low", effortMinutes: 5 }),
    rec("a", { priority: "high", effortMinutes: 240 }),
    rec("b", { priority: "high", effortMinutes: 10 }),
    rec("d", { priority: "medium", effortMinutes: 5 }),
  ]);
  assert.deepEqual(ranked.map((r) => r.key), ["b", "a", "d", "c"]);
});

test("ranking is stable for identical items", () => {
  const items = [rec("z"), rec("a")];
  assert.deepEqual(rankRecommendations(items).map((r) => r.key), ["a", "z"]);
  assert.deepEqual(rankRecommendations(items).map((r) => r.key), ["a", "z"]);
});

test("grouping drops empty types and keeps the ranked order inside each", () => {
  const groups = groupByType([
    rec("r1", { type: "resume" }),
    rec("s1", { type: "skill" }),
    rec("r2", { type: "resume" }),
  ]);
  assert.deepEqual(groups.map((g) => g.type), ["resume", "skill"]);
  assert.deepEqual(groups[0].items.map((i) => i.key), ["r1", "r2"]);
});

// ── Onboarding: derivation ───────────────────────────────────────────────────

test("a profile with no roles and no skills is not a useful profile", () => {
  assert.equal(profileIsUseful(null), false);
  assert.equal(profileIsUseful({ careerLevel: "fresher", targetRoles: [], skills: [] }), false);
  assert.equal(profileIsUseful({ targetRoles: ["Frontend Developer"], skills: [] }), true);
  assert.equal(profileIsUseful({ targetRoles: [], skills: ["React"] }), true);
});

test("steps are satisfied by records, not by having clicked through them", () => {
  const satisfied = deriveSatisfied({
    profile: { targetRoles: ["Frontend Developer"], skills: [] },
    resumeCount: 2, versionCount: 0, assessmentCount: 0, analysisCount: 1,
  });
  assert.deepEqual(satisfied, { profile: true, resume: true, assessment: true, next_steps: true });
});

test("a brand-new account satisfies nothing", () => {
  const satisfied = deriveSatisfied({ profile: null, resumeCount: 0, versionCount: 0, assessmentCount: 0, analysisCount: 0 });
  assert.deepEqual(satisfied, { profile: false, resume: false, assessment: false, next_steps: false });
});

test("the next step is the first one neither satisfied nor skipped", () => {
  assert.equal(nextStep({ profile: false, resume: false, assessment: false, next_steps: false }), "profile");
  assert.equal(nextStep({ profile: true, resume: false, assessment: false, next_steps: false }), "resume");
  assert.equal(nextStep({ profile: true, resume: false, assessment: false, next_steps: false }, ["resume"]), "assessment");
  assert.equal(nextStep({ profile: true, resume: true, assessment: true, next_steps: true }), "done");
});

test("skipping a required step still completes the flow — it is the user's call", () => {
  const satisfied = { profile: true, resume: false, assessment: false, next_steps: false };
  assert.equal(isComplete(satisfied), false);
  assert.equal(isComplete(satisfied, ["resume"]), true);
});

test("every step declares where its data actually lives", () => {
  for (const step of ONBOARDING_STEPS) {
    assert.ok(step.ownedBy, `${step.key} must say which model owns its data`);
    assert.ok(step.href.startsWith("/"), `${step.key} must link to the feature that owns it`);
  }
});

// ── HTTP: recommendations ────────────────────────────────────────────────────

test("recommendations require authentication", async () => {
  assert.equal((await api("/api/recommendations")).status, 401);
  assert.equal((await api("/api/recommendations/abc", { method: "PATCH", body: { status: "done" } })).status, 401);
});

test("a new account gets explained, linked recommendations from its own records", async () => {
  const token = await registerUser("rec-new@example.com");
  const r = await api("/api/recommendations", { token });
  assert.equal(r.status, 200);
  assert.equal(r.body.method, "recommendations-1.0");
  assert.ok(r.body.recommendations.length > 0, "a new user should be told where to start");
  for (const item of r.body.recommendations) {
    assert.ok(item.id, "each item needs an id so it can be dismissed");
    assert.ok(item.reason, "each item must say why it is here");
    assert.ok(item.href?.startsWith("/"), "each item must link somewhere");
    assert.ok(STEP_KEYS.length > 0);
  }
  assert.ok(r.body.basis.length > 0, "the response should say what it was derived from");
});

test("dismissing a recommendation keeps it gone across a refresh", async () => {
  const token = await registerUser("rec-dismiss@example.com");
  const first = await api("/api/recommendations", { token });
  const target = first.body.recommendations[0];
  assert.ok(target, "need at least one recommendation to dismiss");

  const patched = await api(`/api/recommendations/${target.id}`, { method: "PATCH", token, body: { status: "dismissed" } });
  assert.equal(patched.status, 200);

  const after = await api("/api/recommendations?refresh=true", { token });
  assert.equal(after.status, 200);
  assert.equal(
    after.body.recommendations.some((r) => r.key === target.key),
    false,
    "a recomputation must not resurrect something the user dismissed"
  );
});

test("one user cannot change another user's recommendation", async () => {
  const owner = await registerUser("rec-owner@example.com");
  const stranger = await registerUser("rec-stranger@example.com");
  const mine = (await api("/api/recommendations", { token: owner })).body.recommendations[0];

  const attempt = await api(`/api/recommendations/${mine.id}`, { method: "PATCH", token: stranger, body: { status: "dismissed" } });
  assert.equal(attempt.status, 404, "someone else's row must look absent, not forbidden");

  const still = await api("/api/recommendations", { token: owner });
  assert.equal(still.body.recommendations.some((r) => r.id === mine.id), true, "the owner's item must be untouched");
});

test("an invalid status is rejected", async () => {
  const token = await registerUser("rec-badstatus@example.com");
  const item = (await api("/api/recommendations", { token })).body.recommendations[0];
  const bad = await api(`/api/recommendations/${item.id}`, { method: "PATCH", token, body: { status: "maybe" } });
  assert.equal(bad.status, 400);
});

// ── HTTP: onboarding ─────────────────────────────────────────────────────────

test("onboarding requires authentication", async () => {
  assert.equal((await api("/api/onboarding")).status, 401);
  assert.equal((await api("/api/onboarding/steps/profile", { method: "POST", body: {} })).status, 401);
});

test("a new account starts at the profile step with nothing satisfied", async () => {
  const token = await registerUser("ob-new@example.com");
  const r = await api("/api/onboarding", { token });
  assert.equal(r.status, 200);
  assert.equal(r.body.currentStep, "profile");
  assert.equal(r.body.complete, false);
  assert.equal(r.body.started, false, "reading the state must not itself start the flow");
  assert.equal(r.body.progress.satisfied, 0);
  assert.deepEqual(r.body.steps.map((s) => s.key), STEP_KEYS);
});

test("an existing account with a profile is not asked to fill it in again", async () => {
  const token = await registerUser("ob-existing@example.com");
  const saved = await api("/api/career/profile", {
    method: "PUT",
    token,
    body: { careerLevel: "mid", targetRoles: ["Backend Developer"], skills: ["Node.js"], locations: [], workMode: "any", industries: [], learningInterests: [] },
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));

  const r = await api("/api/onboarding", { token });
  assert.equal(r.body.steps.find((s) => s.key === "profile").satisfied, true);
  assert.equal(r.body.currentStep, "resume", "it should move on rather than re-ask");
});

test("skipping a step advances past it and is remembered", async () => {
  const token = await registerUser("ob-skip@example.com");
  const skipped = await api("/api/onboarding/steps/profile", { method: "POST", token, body: { action: "skip" } });
  assert.equal(skipped.status, 200);
  assert.equal(skipped.body.currentStep, "resume");
  assert.equal(skipped.body.steps.find((s) => s.key === "profile").skipped, true);

  const reread = await api("/api/onboarding", { token });
  assert.equal(reread.body.steps.find((s) => s.key === "profile").skipped, true, "a skip must survive a reload");
});

test("completing a step the user had skipped clears the skip", async () => {
  const token = await registerUser("ob-unskip@example.com");
  await api("/api/onboarding/steps/resume", { method: "POST", token, body: { action: "skip" } });
  const done = await api("/api/onboarding/steps/resume", { method: "POST", token, body: { action: "complete" } });
  const step = done.body.steps.find((s) => s.key === "resume");
  assert.equal(step.skipped, false);
  assert.equal(step.completed, true);
});

test("an unknown step is rejected rather than silently recorded", async () => {
  const token = await registerUser("ob-badstep@example.com");
  const r = await api("/api/onboarding/steps/not-a-step", { method: "POST", token, body: { action: "complete" } });
  assert.equal(r.status, 400);
});

test("dismissing stops the flow being offered, and restart brings it back", async () => {
  const token = await registerUser("ob-dismiss@example.com");
  const dismissed = await api("/api/onboarding/dismiss", { method: "POST", token });
  assert.equal(dismissed.status, 200);
  assert.equal(dismissed.body.dismissed, true);

  const restarted = await api("/api/onboarding/restart", { method: "POST", token });
  assert.equal(restarted.body.dismissed, false);
});

test("onboarding progress is per account", async () => {
  const a = await registerUser("ob-a@example.com");
  const b = await registerUser("ob-b@example.com");
  await api("/api/onboarding/steps/profile", { method: "POST", token: a, body: { action: "skip" } });

  const other = await api("/api/onboarding", { token: b });
  assert.equal(other.body.steps.find((s) => s.key === "profile").skipped, false, "one user's skip must not leak to another");
});

test("onboarding stores no copy of the answers it collects", async () => {
  const token = await registerUser("ob-nodupe@example.com");
  await api("/api/career/profile", {
    method: "PUT",
    token,
    body: { careerLevel: "mid", targetRoles: ["Data Engineer"], skills: ["SQL"], locations: [], workMode: "any", industries: [], learningInterests: [] },
  });
  await api("/api/onboarding/steps/profile", { method: "POST", token, body: { action: "complete" } });

  // The progress row holds progress, and nothing that belongs to CareerProfile.
  const rows = prisma.tables.userOnboarding;
  assert.equal(rows.length > 0, true);
  for (const row of rows) {
    const serialised = JSON.stringify(row);
    assert.equal(serialised.includes("Data Engineer"), false, "target roles belong to CareerProfile only");
    assert.equal(serialised.includes("SQL"), false, "skills belong to CareerProfile only");
  }
});

// ── Duplicate applications ───────────────────────────────────────────────────

test("the same job cannot be tracked twice by accident", async () => {
  const token = await registerUser("dupe-guard@example.com");
  const body = { jobTitle: "Frontend Developer", companyName: "Acme", status: "INTERESTED" };

  const first = await api("/api/applications", { method: "POST", token, body });
  assert.equal(first.status, 201);

  const second = await api("/api/applications", { method: "POST", token, body });
  assert.equal(second.status, 409, "a second record for the same job should be refused");
  assert.equal(second.body.error.code, "DUPLICATE_APPLICATION");
  assert.equal(second.body.error.details.applicationId, first.body.application.id, "it should point at the record that already exists");
});

test("company and title match regardless of case", async () => {
  const token = await registerUser("dupe-case@example.com");
  await api("/api/applications", { method: "POST", token, body: { jobTitle: "Backend Engineer", companyName: "Globex", status: "INTERESTED" } });
  const again = await api("/api/applications", { method: "POST", token, body: { jobTitle: "backend engineer", companyName: "globex", status: "INTERESTED" } });
  assert.equal(again.status, 409, "“Globex” and “globex” are the same employer");
});

test("a deliberate second application is still allowed", async () => {
  const token = await registerUser("dupe-allow@example.com");
  const body = { jobTitle: "Designer", companyName: "Initech", status: "INTERESTED" };
  await api("/api/applications", { method: "POST", token, body });
  const second = await api("/api/applications", { method: "POST", token, body: { ...body, allowDuplicate: true } });
  assert.equal(second.status, 201, "the user may knowingly track two");
});

test("re-applying after a closed application is not blocked", async () => {
  const token = await registerUser("dupe-closed@example.com");
  const body = { jobTitle: "Analyst", companyName: "Umbrella", status: "INTERESTED" };
  const first = await api("/api/applications", { method: "POST", token, body });
  const closed = await api(`/api/applications/${first.body.application.id}`, {
    method: "PATCH", token, body: { status: "REJECTED", confirmUnusual: true },
  });
  assert.equal(closed.status, 200, JSON.stringify(closed.body));

  const again = await api("/api/applications", { method: "POST", token, body });
  assert.equal(again.status, 201, "applying again a season later is a real thing people do");
});

test("the duplicate check is per account", async () => {
  const a = await registerUser("dupe-a@example.com");
  const b = await registerUser("dupe-b@example.com");
  const body = { jobTitle: "SRE", companyName: "Hooli", status: "INTERESTED" };
  assert.equal((await api("/api/applications", { method: "POST", token: a, body })).status, 201);
  assert.equal((await api("/api/applications", { method: "POST", token: b, body })).status, 201, "another user's application must not block mine");
});
