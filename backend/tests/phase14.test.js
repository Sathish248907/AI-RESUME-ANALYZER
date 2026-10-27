/**
 * Phase 14 tests: the token vault, the OAuth 2.0 + PKCE flow (state validation,
 * replay, expiry, denial, refresh, revoked grants, disconnect), the integration
 * registry's honesty about what is actually connectable, Google Calendar sync
 * (idempotency, duplicate prevention, timezone, rate limits, reconnect),
 * Drive export authorization, the email service's refusal to claim delivery it
 * did not make, and the automation engine (triggers, conditions, approval
 * gates, partial failure, retry idempotency, pause-all) — plus cross-user
 * isolation on every endpoint.
 *
 * Every provider call goes through an injected `integrationFetch`, so nothing
 * here touches the network.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { loadEnv } from "../src/config/env.js";
import { createApp } from "../src/app.js";
import { TEST_ENV, fakeLlm, fakePrisma, JOB_DESCRIPTION } from "./fixtures.js";
import * as fx from "./fixtures.js";
import { createTokenVault, safeEquals } from "../src/services/integrations/tokenVault.js";
import { describeIntegrations, redirectUriFor } from "../src/services/integrations/integrationRegistry.js";
import { contentHashOf, DEFAULT_CALENDAR_PREFERENCES } from "../src/services/integrations/googleCalendarService.js";
import { WORKFLOWS, ACTION_TYPES, describeWorkflow } from "../src/services/automation/automationCatalog.js";

// ── Harness ──────────────────────────────────────────────────────────────────

/** Google credentials present, so the OAuth paths are exercisable. */
const GOOGLE_ENV = { ...TEST_ENV, GOOGLE_CLIENT_ID: "test-client-id", GOOGLE_CLIENT_SECRET: "test-client-secret" };

let server, baseUrl, prisma, fetchHandler = null;
const fetchCalls = [];
const tokenEmail = new Map();

async function integrationFetch(url, init = {}) {
  fetchCalls.push({ url: String(url), method: init.method ?? "GET", body: init.body ?? null });
  if (!fetchHandler) throw new Error(`unexpected provider fetch: ${url}`);
  return fetchHandler(String(url), init);
}
const jsonResponse = (payload, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => payload });

async function ensureServer(env = GOOGLE_ENV) {
  if (server) return;
  prisma = fakePrisma();
  const app = createApp({ env: loadEnv(env), prisma, llm: fakeLlm(() => fx.validAiOutput()), integrationFetch });
  await new Promise((resolve) => { server = app.listen(0, () => { baseUrl = `http://127.0.0.1:${server.address().port}`; resolve(); }); server.unref(); });
}
after(() => new Promise((r) => (server ? server.close(r) : r())));

async function api(path, { method = "GET", token, body, redirect = "manual" } = {}) {
  await ensureServer();
  const res = await fetch(baseUrl + path, {
    method,
    redirect,
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3001", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
  return { status: res.status, body: parsed, text, location: res.headers.get("location") };
}

async function registerUser(email) {
  const r = await api("/api/auth/register", { method: "POST", body: { email, password: "password123" } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  tokenEmail.set(r.body.token, email);
  return r.body.token;
}

/** Walk the whole OAuth dance and return the connected state. */
async function connectGoogle(token, provider = "google_calendar", { refreshToken = "refresh-abc", expiresIn = 3600 } = {}) {
  const start = await api(`/api/integrations/${provider}/connect`, { method: "POST", token, body: {} });
  assert.equal(start.status, 200, JSON.stringify(start.body));
  const state = new URL(start.body.authorizationUrl).searchParams.get("state");
  fetchHandler = async () => jsonResponse({
    access_token: "access-123", refresh_token: refreshToken, token_type: "Bearer",
    expires_in: expiresIn, scope: provider === "google_calendar" ? "https://www.googleapis.com/auth/calendar.events" : "https://www.googleapis.com/auth/drive.file",
  });
  const cb = await api(`/api/integrations/callback?state=${encodeURIComponent(state)}&code=auth-code-1`);
  assert.equal(cb.status, 302, cb.text?.slice(0, 200));
  return { state, redirect: cb.location, authorizationUrl: start.body.authorizationUrl };
}

// ── 1. Token vault ───────────────────────────────────────────────────────────

test("the vault seals and opens credentials, and refuses to work without a key", () => {
  const vault = createTokenVault({ INTEGRATION_ENCRYPTION_KEY: "dGVzdC1rZXktMzItYnl0ZXMtZm9yLXZhdWx0LXRlc3Q=" });
  const sealed = vault.seal({ accessToken: "secret-access", refreshToken: "secret-refresh" });

  assert.ok(sealed.startsWith("v1."), "versioned envelope");
  assert.ok(!sealed.includes("secret-access"), "the plaintext is not recoverable from the stored value");
  assert.deepEqual(vault.open(sealed), { accessToken: "secret-access", refreshToken: "secret-refresh" });

  // Two seals of the same value differ: the IV is random, so the ciphertext is
  // not a stable fingerprint of the token.
  assert.notEqual(vault.seal({ accessToken: "same" }), vault.seal({ accessToken: "same" }));

  // Tampering fails closed rather than decrypting to something else.
  const parts = sealed.split(".");
  const tampered = [parts[0], parts[1], parts[2], Buffer.from("rubbish").toString("base64url")].join(".");
  assert.throws(() => vault.open(tampered), /could not be decrypted/i);
  assert.throws(() => vault.open("not-an-envelope"), /unreadable/i);

  // A different key cannot open it.
  const other = createTokenVault({ INTEGRATION_ENCRYPTION_KEY: Buffer.from("different-key-32-bytes-for-test!").toString("base64") });
  assert.throws(() => other.open(sealed), /could not be decrypted/i);

  // No key at all: refuse, with the setup instruction.
  const none = createTokenVault({ INTEGRATION_ENCRYPTION_KEY: "" });
  assert.equal(none.configured, false);
  assert.throws(() => none.seal({ a: 1 }), /INTEGRATION_ENCRYPTION_KEY/);
  assert.throws(() => none.assertReady(), /not configured/i);

  // A wrong-length key is a configuration error, not a crypto mystery.
  assert.throws(() => createTokenVault({ INTEGRATION_ENCRYPTION_KEY: Buffer.from("too-short").toString("base64") }).seal({}), /32 bytes/);
});

test("describe() exposes metadata only — never token material", () => {
  const vault = createTokenVault({ INTEGRATION_ENCRYPTION_KEY: "dGVzdC1rZXktMzItYnl0ZXMtZm9yLXZhdWx0LXRlc3Q=" });
  const credentials = vault.seal({ accessToken: "top-secret", refreshToken: "also-secret" });
  const described = vault.describe({ provider: "google_calendar", status: "connected", scopes: ["a"], credentials, hasRefreshToken: true });
  const serialised = JSON.stringify(described);
  assert.ok(!serialised.includes("top-secret"));
  assert.ok(!serialised.includes("also-secret"));
  assert.ok(!serialised.includes(credentials), "not even the sealed blob is returned");
  assert.equal(described.hasRefreshToken, true);
  assert.equal(described.credentialFingerprint.length, 12);
});

test("state comparison is constant-time and rejects mismatched lengths", () => {
  assert.equal(safeEquals("abc123", "abc123"), true);
  assert.equal(safeEquals("abc123", "abc124"), false);
  assert.equal(safeEquals("abc", "abcdef"), false);
  assert.equal(safeEquals("", ""), false, "empty is never a match");
  assert.equal(safeEquals(null, undefined), false);
});

// ── 2. Registry honesty ──────────────────────────────────────────────────────

test("an integration is connectable only when the server could really complete it", () => {
  const withKeys = describeIntegrations(loadEnv(GOOGLE_ENV), { jobProviders: [], connections: new Map() });
  const calendar = withKeys.integrations.find((i) => i.provider === "google_calendar");
  assert.equal(calendar.readiness, "available");
  assert.equal(calendar.connectable, true);
  assert.deepEqual(calendar.blockers, []);

  // No client credentials: implemented, but not connectable, and it says why.
  const noKeys = describeIntegrations(loadEnv(TEST_ENV), { jobProviders: [], connections: new Map() });
  const cal2 = noKeys.integrations.find((i) => i.provider === "google_calendar");
  assert.equal(cal2.readiness, "needs_setup");
  assert.equal(cal2.connectable, false);
  assert.ok(cal2.blockers.some((b) => /GOOGLE_CLIENT_ID/.test(b)));
  assert.ok(cal2.setupSteps.some((s) => s.includes("/api/integrations/callback")), "setup steps name the exact redirect URI");

  // No vault key: nothing OAuth can connect, whatever else is set.
  const noVault = describeIntegrations(loadEnv({ ...GOOGLE_ENV, INTEGRATION_ENCRYPTION_KEY: "" }), { jobProviders: [], connections: new Map() });
  assert.equal(noVault.vault.configured, false);
  assert.ok(noVault.integrations.filter((i) => i.kind === "oauth").every((i) => i.connectable === false));
  assert.match(noVault.vault.note, /refuses to store tokens unencrypted/i);
});

test("scopes are least-privilege and each one is explained", () => {
  const described = describeIntegrations(loadEnv(GOOGLE_ENV), {});
  const calendar = described.integrations.find((i) => i.provider === "google_calendar");
  const drive = described.integrations.find((i) => i.provider === "google_drive");

  assert.deepEqual(calendar.scopes, ["https://www.googleapis.com/auth/calendar.events"]);
  assert.ok(!calendar.scopes.some((s) => s.endsWith("/calendar")), "not the full calendar scope");
  assert.deepEqual(drive.scopes, ["https://www.googleapis.com/auth/drive.file"]);
  assert.ok(!drive.scopes.some((s) => s.endsWith("/drive")), "not full Drive access");

  for (const i of [calendar, drive]) {
    assert.ok(i.scopes.every((s) => i.scopeExplanations[s]), "every scope is explained in plain words");
    assert.ok(i.doesNot.length > 0, "and what it will not do is stated");
  }
  assert.match(drive.scopeExplanations[drive.scopes[0]], /only the files this app created/i);
});

test("email is never presented as a connected account, and never reads a mailbox", () => {
  const described = describeIntegrations(loadEnv(TEST_ENV), {});
  const email = described.integrations.find((i) => i.provider === "email");
  assert.equal(email.readiness, "needs_setup");
  assert.equal(email.connectable, false);
  assert.ok(email.doesNot.some((d) => /never reads your inbox/i.test(d)));
  assert.ok(email.doesNot.some((d) => /never emails an employer/i.test(d)));
  assert.ok(!JSON.stringify(described).includes("mail.google.com"), "no mailbox scope exists anywhere in the registry");
});

test("job providers are surfaced from Phase 12 rather than reinvented", () => {
  const described = describeIntegrations(loadEnv(TEST_ENV), {
    jobProviders: [
      { slug: "remotive", displayName: "Remotive", enabled: true, configured: true, requiresCredentials: false, credentialKeys: [], missingCredentials: [], attribution: "Listings by Remotive", docsUrl: "https://example.com" },
      { slug: "adzuna", displayName: "Adzuna", enabled: false, configured: false, requiresCredentials: true, credentialKeys: ["ADZUNA_APP_ID"], missingCredentials: ["ADZUNA_APP_ID"], attribution: null, docsUrl: null },
    ],
  });
  const remotive = described.integrations.find((i) => i.provider === "job:remotive");
  const adzuna = described.integrations.find((i) => i.provider === "job:adzuna");
  assert.equal(remotive.readiness, "available");
  assert.equal(remotive.connection.status, "connected");
  assert.equal(remotive.managedAt, "/dashboard/jobs/preferences", "managed where they already live");
  assert.equal(adzuna.readiness, "needs_setup");
  assert.equal(remotive.connectable, false, "job providers are configured by env, not an OAuth button");
});

// ── 3. OAuth flow ────────────────────────────────────────────────────────────

test("the authorization URL carries PKCE, least-privilege scopes and a fresh state", async () => {
  const token = await registerUser("p14-auth@example.com");
  const res = await api("/api/integrations/google_calendar/connect", { method: "POST", token, body: {} });
  assert.equal(res.status, 200, JSON.stringify(res.body));

  const url = new URL(res.body.authorizationUrl);
  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.ok(url.searchParams.get("code_challenge")?.length >= 42, "a real challenge, not a placeholder");
  assert.equal(url.searchParams.get("scope"), "https://www.googleapis.com/auth/calendar.events");
  assert.equal(url.searchParams.get("redirect_uri"), redirectUriFor(loadEnv(GOOGLE_ENV)));
  assert.equal(url.searchParams.get("access_type"), "offline", "needed for a refresh token");
  assert.ok(!url.searchParams.get("code_verifier"), "the verifier never leaves the backend");

  // Two starts produce different states.
  const second = await api("/api/integrations/google_calendar/connect", { method: "POST", token, body: {} });
  assert.notEqual(new URL(second.body.authorizationUrl).searchParams.get("state"), url.searchParams.get("state"));
  assert.match(res.body.note, /Nothing is connected until you come back/i);
});

test("the callback exchanges the code with the verifier and stores tokens encrypted", async () => {
  const token = await registerUser("p14-callback@example.com");
  fetchCalls.length = 0;
  await connectGoogle(token);

  const exchange = fetchCalls.find((c) => c.url.includes("oauth2.googleapis.com/token"));
  assert.ok(exchange, "the token endpoint was called");
  const sent = new URLSearchParams(exchange.body);
  assert.equal(sent.get("grant_type"), "authorization_code");
  assert.ok(sent.get("code_verifier"), "PKCE verifier is sent on exchange");
  assert.equal(sent.get("client_secret"), "test-client-secret");

  const status = await api("/api/integrations/google_calendar/status", { token });
  assert.equal(status.body.connected, true);
  assert.deepEqual(status.body.scopes, ["https://www.googleapis.com/auth/calendar.events"]);
  assert.ok(status.body.credential.credentialFingerprint);
  // Nothing token-shaped reaches the client.
  assert.ok(!status.text.includes("access-123"));
  assert.ok(!status.text.includes("refresh-abc"));
  assert.ok(!/"credentials"/.test(status.text));
});

test("a replayed, forged, expired or declined callback never connects anything", async () => {
  const token = await registerUser("p14-state@example.com");

  // Forged state.
  const forged = await api("/api/integrations/callback?state=aaaaaaaaaaaaaaaaaaaaaaaa&code=x");
  assert.equal(forged.status, 302);
  assert.match(forged.location, /error=OAUTH_STATE_INVALID/);

  // Replay: the same state cannot be used twice.
  const start = await api("/api/integrations/google_calendar/connect", { method: "POST", token, body: {} });
  const state = new URL(start.body.authorizationUrl).searchParams.get("state");
  fetchHandler = async () => jsonResponse({ access_token: "a", refresh_token: "r", token_type: "Bearer", expires_in: 3600, scope: "https://www.googleapis.com/auth/calendar.events" });
  assert.equal((await api(`/api/integrations/callback?state=${state}&code=c1`)).status, 302);
  const replay = await api(`/api/integrations/callback?state=${state}&code=c1`);
  assert.match(replay.location, /error=OAUTH_STATE_INVALID/, "single use");

  // Declined consent is a cancellation, not a failure, and connects nothing.
  const token2 = await registerUser("p14-declined@example.com");
  const start2 = await api("/api/integrations/google_calendar/connect", { method: "POST", token: token2, body: {} });
  const state2 = new URL(start2.body.authorizationUrl).searchParams.get("state");
  const declined = await api(`/api/integrations/callback?state=${state2}&error=access_denied`);
  assert.match(declined.location, /error=OAUTH_DECLINED/);
  assert.equal((await api("/api/integrations/google_calendar/status", { token: token2 })).body.connected, false);

  // Malformed state never reaches the service.
  assert.equal((await api("/api/integrations/callback?state=../../etc&code=x")).status, 400);
  assert.equal((await api("/api/integrations/callback?code=x")).status, 400, "state is required");
});

test("an expired authorization is refused", async () => {
  const token = await registerUser("p14-expiry@example.com");
  const start = await api("/api/integrations/google_calendar/connect", { method: "POST", token, body: {} });
  const state = new URL(start.body.authorizationUrl).searchParams.get("state");

  // Age the pending record past its ten-minute window.
  const pending = prisma.tables.pendingAuthorization.find((p) => p.state === state);
  pending.expiresAt = new Date(Date.now() - 1000);

  const res = await api(`/api/integrations/callback?state=${state}&code=c`);
  assert.match(res.location, /error=OAUTH_STATE_EXPIRED/);
});

test("a provider that refuses the exchange leaves nothing connected", async () => {
  const token = await registerUser("p14-exchange-fail@example.com");
  const start = await api("/api/integrations/google_calendar/connect", { method: "POST", token, body: {} });
  const state = new URL(start.body.authorizationUrl).searchParams.get("state");
  fetchHandler = async () => jsonResponse({ error: "invalid_grant", error_description: "Code was already redeemed." }, 400);
  const res = await api(`/api/integrations/callback?state=${state}&code=used`);
  assert.match(res.location, /error=OAUTH_EXCHANGE_FAILED/);
  assert.equal((await api("/api/integrations/google_calendar/status", { token })).body.connected, false);
});

test("connecting is refused when the server is not configured for it", async () => {
  // A separate app with no Google credentials and no vault key.
  const localPrisma = fakePrisma();
  const app = createApp({ env: loadEnv({ ...TEST_ENV, INTEGRATION_ENCRYPTION_KEY: "" }), prisma: localPrisma, llm: fakeLlm(() => fx.validAiOutput()), integrationFetch: async () => { throw new Error("must not call a provider"); } });
  const srv = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const url = `http://127.0.0.1:${srv.address().port}`;
  try {
    const reg = await fetch(`${url}/api/auth/register`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:3001" }, body: JSON.stringify({ email: "p14-unconfigured@example.com", password: "password123" }) });
    const { token } = await reg.json();
    const res = await fetch(`${url}/api/integrations/google_calendar/connect`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, Origin: "http://localhost:3001" }, body: "{}" });
    const body = await res.json();
    assert.equal(res.status, 503);
    assert.equal(body.error.code, "VAULT_NOT_CONFIGURED");
    assert.match(body.error.message, /INTEGRATION_ENCRYPTION_KEY/);

    const list = await (await fetch(`${url}/api/integrations`, { headers: { Authorization: `Bearer ${token}`, Origin: "http://localhost:3001" } })).json();
    assert.equal(list.vault.configured, false);
    assert.ok(list.integrations.filter((i) => i.kind === "oauth").every((i) => !i.connectable));
    assert.ok(list.integrations.every((i) => i.readiness !== "available" || i.kind !== "oauth"));
  } finally {
    await new Promise((r) => srv.close(r));
  }
});

test("an expired access token refreshes, and a revoked grant asks for reconnection", async () => {
  const token = await registerUser("p14-refresh@example.com");
  await connectGoogle(token, "google_calendar", { expiresIn: 1 });
  // A sync with nothing to send needs no token at all, so give it something.
  await seedInterview(token);

  // Force expiry.
  const row = prisma.tables.externalIntegration.find((i) => i.provider === "google_calendar" && i.userId === prisma.tables.user.find((u) => u.email === "p14-refresh@example.com").id);
  row.expiresAt = new Date(Date.now() - 60_000);

  // A sync triggers the refresh first.
  let refreshed = false;
  fetchHandler = async (url) => {
    if (url.includes("oauth2.googleapis.com/token")) { refreshed = true; return jsonResponse({ access_token: "access-new", token_type: "Bearer", expires_in: 3600 }); }
    return jsonResponse({ items: [] });
  };
  const sync = await api("/api/integrations/google_calendar/sync", { method: "POST", token, body: {} });
  assert.equal(sync.status, 200, JSON.stringify(sync.body));
  assert.equal(refreshed, true, "the token was refreshed before the provider call");

  // Now the provider rejects the refresh: the grant was revoked at Google.
  // The event must actually need sending, otherwise an unchanged sync
  // correctly makes no provider call and needs no token.
  row.expiresAt = new Date(Date.now() - 60_000);
  const round = prisma.tables.applicationInterview.find((i) => i.userId === row.userId);
  round.scheduledAt = new Date(Date.now() + 9 * 86_400_000);
  fetchHandler = async () => jsonResponse({ error: "invalid_grant", error_description: "Token has been revoked." }, 400);
  const after = await api("/api/integrations/google_calendar/sync", { method: "POST", token, body: {} });
  assert.equal(after.status, 409);
  assert.equal(after.body.error.code, "REAUTH_REQUIRED");
  assert.equal((await api("/api/integrations/google_calendar/status", { token })).body.status, "expired");
});

test("disconnecting revokes at the provider and deletes the stored credentials", async () => {
  const token = await registerUser("p14-disconnect@example.com");
  await connectGoogle(token);

  let revokeCalled = false;
  fetchHandler = async (url) => {
    if (url.includes("/revoke")) { revokeCalled = true; return jsonResponse({}, 200); }
    return jsonResponse({});
  };
  const res = await api("/api/integrations/google_calendar/disconnect", { method: "POST", token });
  assert.equal(res.status, 200);
  assert.equal(revokeCalled, true);
  assert.equal(res.body.revokedAtProvider, true);
  assert.equal(res.body.credentialsDeleted, true);

  const stored = prisma.tables.externalIntegration.find((i) => i.provider === "google_calendar" && i.userId === prisma.tables.user.find((u) => u.email === "p14-disconnect@example.com").id);
  assert.equal(stored.credentials, null, "the sealed blob is gone, not just the status");
  assert.equal(stored.status, "disconnected");

  const history = await api("/api/integrations/google_calendar/sync-history", { token });
  assert.ok(history.body.entries.some((e) => e.action === "disconnect"));
});

test("a provider that cannot be reached still deletes the local credentials", async () => {
  const token = await registerUser("p14-disconnect-offline@example.com");
  await connectGoogle(token);
  fetchHandler = async () => { throw new Error("network down"); };
  const res = await api("/api/integrations/google_calendar/disconnect", { method: "POST", token });
  assert.equal(res.status, 200);
  assert.equal(res.body.revokedAtProvider, false);
  assert.equal(res.body.credentialsDeleted, true, "a user asking to disconnect is never left holding a token");
  assert.match(res.body.note, /security settings/i);
});

// ── 4. Calendar sync ─────────────────────────────────────────────────────────

test("the content hash changes only when something the event shows changes", () => {
  const base = { summary: "Technical interview", description: "d", start: "2026-12-01T10:00:00.000Z", end: "2026-12-01T11:00:00.000Z", timeZone: "Asia/Kolkata", location: null };
  assert.equal(contentHashOf(base), contentHashOf({ ...base }));
  assert.notEqual(contentHashOf(base), contentHashOf({ ...base, start: "2026-12-01T12:00:00.000Z" }));
  assert.notEqual(contentHashOf(base), contentHashOf({ ...base, timeZone: "UTC" }), "a timezone change is a real change");
  assert.notEqual(contentHashOf(base), contentHashOf({ ...base, summary: "Final interview" }));
});

/** An application with a scheduled interview round, for calendar tests. */
async function seedInterview(token, { scheduledAt = new Date(Date.now() + 2 * 86_400_000).toISOString(), timezone = "Asia/Kolkata" } = {}) {
  const jd = await api("/api/job-descriptions", { method: "POST", token, body: { jobTitle: "Senior Frontend Developer", companyName: "Acme", targetRole: "Frontend Developer", description: JOB_DESCRIPTION } });
  const application = await api("/api/applications", { method: "POST", token, body: { companyName: "Acme", jobTitle: "Senior Frontend Developer", jobDescriptionId: jd.body.jobDescription.id } });
  const round = await api(`/api/applications/${application.body.application.id}/interviews`, {
    method: "POST", token,
    body: { stage: "technical", scheduledAt, timezone, durationMinutes: 60, mode: "video" },
  });
  assert.equal(round.status, 201, JSON.stringify(round.body).slice(0, 200));
  return { applicationId: application.body.application.id, interviewId: round.body.interview.id };
}

test("calendar sync creates once, is idempotent, and sends no attendees", async () => {
  const token = await registerUser("p14-calendar@example.com");
  await connectGoogle(token);
  await seedInterview(token);

  const created = [];
  fetchHandler = async (url, init) => {
    if (url.includes("/events") && init.method === "POST") {
      created.push(JSON.parse(init.body));
      return jsonResponse({ id: `evt-${created.length}`, htmlLink: "https://calendar.google.com/x" });
    }
    return jsonResponse({});
  };

  const first = await api("/api/integrations/google_calendar/sync", { method: "POST", token, body: {} });
  assert.equal(first.status, 200, JSON.stringify(first.body).slice(0, 300));
  assert.equal(first.body.created, 1);
  assert.equal(created.length, 1);

  // No attendees anywhere: nothing is invited and Google emails nobody.
  assert.equal(created[0].attendees, undefined);
  assert.equal(created[0].start.timeZone, "Asia/Kolkata", "the user's own timezone is sent");
  assert.ok(created[0].start.dateTime && created[0].end.dateTime);

  // A second sync of unchanged data costs no API call at all.
  const callsBefore = fetchCalls.length;
  const second = await api("/api/integrations/google_calendar/sync", { method: "POST", token, body: {} });
  assert.equal(second.body.created, 0);
  assert.equal(second.body.unchanged, 1);
  assert.equal(fetchCalls.length, callsBefore, "nothing was sent for an unchanged event");
  assert.equal(created.length, 1, "no duplicate event");
});

test("changing the interview patches the existing event rather than making a second", async () => {
  const token = await registerUser("p14-calendar-update@example.com");
  await connectGoogle(token);
  const { interviewId } = await seedInterview(token);

  let posts = 0;
  let patches = 0;
  fetchHandler = async (url, init) => {
    if (init.method === "POST" && url.includes("/events")) { posts += 1; return jsonResponse({ id: "evt-1" }); }
    if (init.method === "PATCH") { patches += 1; return jsonResponse({ id: "evt-1" }); }
    return jsonResponse({});
  };
  await api("/api/integrations/google_calendar/sync", { method: "POST", token, body: {} });
  assert.equal(posts, 1);

  await api(`/api/application-interviews/${interviewId}`, { method: "PATCH", token, body: { scheduledAt: new Date(Date.now() + 5 * 86_400_000).toISOString() } });
  const res = await api("/api/integrations/google_calendar/sync", { method: "POST", token, body: {} });
  assert.equal(res.body.updated, 1);
  assert.equal(patches, 1);
  assert.equal(posts, 1, "still exactly one event");
});

test("a dry run shows the plan and sends nothing", async () => {
  const token = await registerUser("p14-calendar-dry@example.com");
  await connectGoogle(token);
  await seedInterview(token);
  fetchHandler = async () => { throw new Error("a dry run must not call the provider"); };

  const res = await api("/api/integrations/google_calendar/sync", { method: "POST", token, body: { dryRun: true } });
  assert.equal(res.status, 200, JSON.stringify(res.body).slice(0, 200));
  assert.equal(res.body.dryRun, true);
  assert.ok(res.body.results.some((r) => r.action === "would_create"));
  assert.match(res.body.note, /Nothing was sent to Google/i);
});

test("event types the user switched off are not synced", async () => {
  const token = await registerUser("p14-calendar-prefs@example.com");
  await connectGoogle(token);
  await seedInterview(token);

  const off = await api("/api/integrations/google_calendar/preferences", { method: "PUT", token, body: { interviews: false } });
  assert.equal(off.status, 200);
  assert.equal(off.body.preferences.interviews, false);

  fetchHandler = async () => { throw new Error("nothing should be synced"); };
  const res = await api("/api/integrations/google_calendar/sync", { method: "POST", token, body: { dryRun: true } });
  assert.equal(res.body.considered, 0, "the round is excluded by preference");
  assert.equal(DEFAULT_CALENDAR_PREFERENCES.reminders, false, "reminders are off by default");
});

test("a rate limit stops the run and is reported rather than retried blindly", async () => {
  const token = await registerUser("p14-calendar-rate@example.com");
  await connectGoogle(token);
  await seedInterview(token);
  fetchHandler = async () => jsonResponse({ error: { errors: [{ reason: "rateLimitExceeded" }] } }, 403);

  const res = await api("/api/integrations/google_calendar/sync", { method: "POST", token, body: {} });
  assert.equal(res.status, 200);
  assert.equal(res.body.failed, 1);
  assert.ok(res.body.results.some((r) => /rate limiting/i.test(r.error ?? "")));
});

test("syncing without a connection is refused, not silently skipped", async () => {
  const token = await registerUser("p14-calendar-none@example.com");
  const res = await api("/api/integrations/google_calendar/sync", { method: "POST", token, body: {} });
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, "NOT_CONNECTED");
});

// ── 5. Drive ─────────────────────────────────────────────────────────────────

test("Drive export refuses an unapproved letter and a document that is not yours", async () => {
  const a = await registerUser("p14-drive-a@example.com");
  const b = await registerUser("p14-drive-b@example.com");
  await connectGoogle(a, "google_drive");

  const userA = prisma.tables.user.find((u) => u.email === "p14-drive-a@example.com");
  const jd = await api("/api/job-descriptions", { method: "POST", token: a, body: { jobTitle: "Dev", companyName: "Acme", targetRole: "Frontend Developer", description: JOB_DESCRIPTION } });
  const application = await api("/api/applications", { method: "POST", token: a, body: { companyName: "Acme", jobTitle: "Dev", jobDescriptionId: jd.body.jobDescription.id } });
  const letter = await prisma.coverLetter.create({
    data: { userId: userA.id, applicationId: application.body.application.id, title: "Draft letter", content: "Dear team,\n\nHello.", status: "draft", versionNumber: 1 },
  });

  const unapproved = await api("/api/integrations/google_drive/export", { method: "POST", token: a, body: { sourceKind: "cover_letter", sourceId: letter.id } });
  assert.equal(unapproved.status, 409);
  assert.equal(unapproved.body.error.code, "NOT_APPROVED", "half-finished work is not exported as if final");

  await prisma.coverLetter.update({ where: { id: letter.id }, data: { status: "approved" } });

  // Another user cannot export it, and cannot learn that it exists.
  await connectGoogle(b, "google_drive");
  const foreign = await api("/api/integrations/google_drive/export", { method: "POST", token: b, body: { sourceKind: "cover_letter", sourceId: letter.id } });
  assert.equal(foreign.status, 404);

  let uploaded = null;
  fetchHandler = async (url, init) => {
    if (url.includes("upload/drive")) { uploaded = { url, method: init.method }; return jsonResponse({ id: "file-1", name: "Draft letter.pdf", webViewLink: "https://drive.google.com/x" }); }
    return jsonResponse({});
  };
  const ok = await api("/api/integrations/google_drive/export", { method: "POST", token: a, body: { sourceKind: "cover_letter", sourceId: letter.id } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body).slice(0, 200));
  assert.equal(ok.body.action, "created");
  assert.ok(uploaded.url.includes("uploadType=multipart"));
  assert.match(ok.body.note, /private to your Drive/i);

  // Exporting again updates the same file rather than littering Drive.
  fetchHandler = async (url, init) => {
    if (url.includes("upload/drive") && init.method === "PATCH") return jsonResponse({ id: "file-1", name: "Draft letter.pdf" });
    return jsonResponse({ id: "file-2" });
  };
  const again = await api("/api/integrations/google_drive/export", { method: "POST", token: a, body: { sourceKind: "cover_letter", sourceId: letter.id } });
  assert.equal(again.body.action, "updated");
  assert.equal(again.body.fileId, "file-1");
});

// ── 6. Email ─────────────────────────────────────────────────────────────────

test("the log transport records a message and never claims it was delivered", async () => {
  const token = await registerUser("p14-email@example.com");
  const status = await api("/api/integrations/email/status", { token });
  assert.equal(status.body.transport, "log");
  assert.equal(status.body.delivers, false, "recording is not delivering");
  assert.ok(status.body.neverDoes.some((n) => /never reads your inbox/i.test(n)));

  const history = await api("/api/integrations/email/history", { token });
  assert.equal(history.body.deliveries.length, 0);
  assert.equal(history.body.delivers, false);
  assert.match(history.body.note, /nothing is delivered/i);
});

// ── 7. Automation ────────────────────────────────────────────────────────────

test("the catalog declares trigger, conditions, actions and failure behaviour for every workflow", () => {
  assert.equal(WORKFLOWS.length, 4);
  for (const w of WORKFLOWS) {
    assert.ok(w.trigger && w.trigger.length > 10, `${w.key} states its trigger`);
    assert.ok(Array.isArray(w.conditions) && w.conditions.length > 0, `${w.key} states its conditions`);
    assert.ok(w.actions.length > 0 && w.actions.every((a) => ACTION_TYPES[a]), `${w.key} uses only known actions`);
    assert.ok(w.failureBehaviour && w.failureBehaviour.length > 10, `${w.key} states what happens on failure`);
    const described = describeWorkflow(w);
    assert.ok(described.neverDoes.some((n) => /employer/i.test(n)));
  }
  // No action can message a third party: the capability does not exist.
  const everyAction = Object.values(ACTION_TYPES);
  assert.ok(everyAction.every((a) => !/employer|recruiter|apply/i.test(a.label)));
  assert.deepEqual(
    everyAction.filter((a) => a.consequence === "external").map((a) => a.key).sort(),
    ["calendar_event", "send_email"],
    "only two actions can leave the app, and both are about the user's own account"
  );
});

test("a workflow with nothing to do says so instead of inventing work", async () => {
  const token = await registerUser("p14-auto-idle@example.com");
  const rule = await api("/api/automation/rules", { method: "POST", token, body: { workflowKey: "interview_preparation", isEnabled: true, config: {} } });
  assert.equal(rule.status, 201);

  const preview = await api(`/api/automation/rules/${rule.body.rule.id}/preview`, { token });
  assert.equal(preview.body.fired, false);
  assert.match(preview.body.reason, /No interview round is scheduled/i);
  assert.deepEqual(preview.body.actions, []);

  const run = await api(`/api/automation/rules/${rule.body.rule.id}/run`, { method: "POST", token, body: {} });
  assert.equal(run.body.ran, false);
  assert.equal(run.body.execution.status, "skipped");
});

test("external actions wait for approval; in-app actions run regardless", async () => {
  const token = await registerUser("p14-auto-approval@example.com");
  await connectGoogle(token);
  await seedInterview(token, { scheduledAt: new Date(Date.now() + 36 * 3_600_000).toISOString() });

  const rule = await api("/api/automation/rules", { method: "POST", token, body: { workflowKey: "interview_preparation", isEnabled: true, config: { leadTimeHours: 72, addToCalendar: true } } });
  const ruleId = rule.body.rule.id;

  const preview = await api(`/api/automation/rules/${ruleId}/preview`, { token });
  assert.equal(preview.body.fired, true);
  assert.equal(preview.body.requiresApproval, true);
  assert.ok(preview.body.actions.every((a) => a.preview), "every action is previewable before it happens");
  assert.ok(preview.body.externalActions.some((a) => a.type === "calendar_event"));

  // Without approval the calendar step is skipped and nothing is sent.
  fetchHandler = async () => { throw new Error("nothing external may run without approval"); };
  const unapproved = await api(`/api/automation/rules/${ruleId}/run`, { method: "POST", token, body: { approved: false } });
  assert.equal(unapproved.status, 200, JSON.stringify(unapproved.body).slice(0, 300));
  assert.equal(unapproved.body.execution.status, "awaiting_approval");
  const calendarResult = unapproved.body.execution.results.find((r) => r.type === "calendar_event");
  assert.equal(calendarResult.status, "skipped_needs_approval");
  // The in-app steps still did their work.
  assert.equal(unapproved.body.execution.results.find((r) => r.type === "notify").status, "ok");
  assert.equal(unapproved.body.execution.results.find((r) => r.type === "prepare_checklist").status, "ok");

  // With approval, the calendar event is created.
  let posted = 0;
  fetchHandler = async (url, init) => {
    if (init.method === "POST" && url.includes("/events")) { posted += 1; return jsonResponse({ id: "evt-auto" }); }
    return jsonResponse({});
  };
  const approved = await api(`/api/automation/rules/${ruleId}/run`, { method: "POST", token, body: { approved: true } });
  assert.equal(approved.body.execution.status, "succeeded");
  assert.equal(posted, 1);
  assert.equal(approved.body.execution.approved, true);
});

test("an option that cannot work yet is labelled rather than silently doing nothing", async () => {
  const token = await registerUser("p14-auto-unavailable@example.com");
  await api("/api/automation/rules", { method: "POST", token, body: { workflowKey: "interview_preparation", isEnabled: true, config: { addToCalendar: true } } });
  const rules = await api("/api/automation/rules", { token });
  const workflow = rules.body.workflows.find((w) => w.key === "interview_preparation");
  assert.ok(workflow.unavailableOptions.some((o) => o.field === "addToCalendar" && /not connected/i.test(o.reason)));
  assert.match(rules.body.safety.message, /never sends a message to an employer/i);
  assert.equal(rules.body.safety.externalActionsRequireApproval, true);
});

test("a follow-up workflow drafts a message and never sends it", async () => {
  const token = await registerUser("p14-auto-followup@example.com");
  const jd = await api("/api/job-descriptions", { method: "POST", token, body: { jobTitle: "Dev", companyName: "Globex", targetRole: "Frontend Developer", description: JOB_DESCRIPTION } });
  const application = await api("/api/applications", { method: "POST", token, body: { companyName: "Globex", jobTitle: "Dev", jobDescriptionId: jd.body.jobDescription.id, status: "APPLIED", nextFollowUpDate: new Date(Date.now() - 86_400_000).toISOString() } });
  assert.equal(application.status, 201, JSON.stringify(application.body).slice(0, 200));

  const rule = await api("/api/automation/rules", { method: "POST", token, body: { workflowKey: "application_follow_up", isEnabled: true, config: { tone: "polite", includeDraft: true } } });
  const run = await api(`/api/automation/rules/${rule.body.rule.id}/run`, { method: "POST", token, body: {} });
  assert.equal(run.body.execution.status, "succeeded", JSON.stringify(run.body.execution.results));

  const draft = run.body.execution.results.find((r) => r.type === "draft_follow_up");
  assert.equal(draft.status, "ok");
  assert.ok(draft.result.draft.body.includes("Globex") || draft.result.draft.body.includes("Dev"));
  assert.match(draft.result.note, /never sends a message to an employer/i);
  // The workflow has no capability to send it.
  assert.ok(!run.body.execution.plannedActions.some((a) => a.consequence === "external"));
});

test("a failed step leaves the successful ones done, and a retry does not repeat them", async () => {
  const token = await registerUser("p14-auto-retry@example.com");
  await connectGoogle(token);
  await seedInterview(token, { scheduledAt: new Date(Date.now() + 24 * 3_600_000).toISOString() });
  const rule = await api("/api/automation/rules", { method: "POST", token, body: { workflowKey: "interview_preparation", isEnabled: true, config: { addToCalendar: true } } });
  const ruleId = rule.body.rule.id;

  // The calendar step fails; the in-app steps succeed.
  fetchHandler = async () => jsonResponse({ error: { message: "backend error" } }, 500);
  const failed = await api(`/api/automation/rules/${ruleId}/run`, { method: "POST", token, body: { approved: true } });
  assert.equal(failed.body.execution.status, "partial");
  assert.equal(failed.body.execution.results.find((r) => r.type === "notify").status, "ok");
  assert.equal(failed.body.execution.results.find((r) => r.type === "calendar_event").status, "failed");
  assert.equal(failed.body.execution.retryable, true);
  assert.ok(failed.body.execution.nextRetryAt, "a retry time is recorded");

  // Retry: the calendar step runs, the already-done steps do not.
  let posted = 0;
  fetchHandler = async (url, init) => {
    if (init.method === "POST" && url.includes("/events")) { posted += 1; return jsonResponse({ id: "evt-retry" }); }
    return jsonResponse({});
  };
  const retried = await api(`/api/automation/executions/${failed.body.execution.id}/retry`, { method: "POST", token });
  assert.equal(retried.status, 200, JSON.stringify(retried.body).slice(0, 300));
  assert.equal(posted, 1);
  assert.equal(retried.body.execution.results.find((r) => r.type === "notify").status, "skipped");
  assert.match(retried.body.execution.results.find((r) => r.type === "notify").detail, /already succeeded/i);
  assert.equal(retried.body.execution.retryCount, 1);
  assert.match(retried.body.note, /not repeated/i);

  // A successful run cannot be retried.
  const again = await api(`/api/automation/executions/${retried.body.execution.id}/retry`, { method: "POST", token });
  assert.equal(again.status, 409);
  assert.equal(again.body.error.code, "NOT_RETRYABLE");
});

test("running the same workflow twice does not duplicate its side effects", async () => {
  const token = await registerUser("p14-auto-idempotent@example.com");
  await seedInterview(token, { scheduledAt: new Date(Date.now() + 12 * 3_600_000).toISOString() });
  const rule = await api("/api/automation/rules", { method: "POST", token, body: { workflowKey: "interview_preparation", isEnabled: true, config: {} } });
  const ruleId = rule.body.rule.id;

  await api(`/api/automation/rules/${ruleId}/run`, { method: "POST", token, body: {} });
  const notificationsAfterFirst = (await api("/api/notifications", { token })).body.notifications.filter((n) => n.type === "automation").length;

  const second = await api(`/api/automation/rules/${ruleId}/run`, { method: "POST", token, body: {} });
  assert.equal(second.body.execution.status, "succeeded");
  const notificationsAfterSecond = (await api("/api/notifications", { token })).body.notifications.filter((n) => n.type === "automation").length;
  assert.equal(notificationsAfterSecond, notificationsAfterFirst, "the same notification is not created twice");
  assert.match(second.body.execution.results.find((r) => r.type === "notify").detail, /Already notified|nothing duplicated/i);
  assert.match(second.body.execution.results.find((r) => r.type === "prepare_checklist").detail, /already present/i);
});

test("a paused workflow refuses to run, and pause-all stops everything", async () => {
  const token = await registerUser("p14-auto-pause@example.com");
  const a = await api("/api/automation/rules", { method: "POST", token, body: { workflowKey: "weekly_summary", isEnabled: true, config: {} } });
  const b = await api("/api/automation/rules", { method: "POST", token, body: { workflowKey: "resume_improvement", isEnabled: true, config: {} } });

  const paused = await api("/api/automation/pause-all", { method: "POST", token });
  assert.equal(paused.body.paused, 2);
  assert.match(paused.body.note, /Nothing will run/i);

  const run = await api(`/api/automation/rules/${a.body.rule.id}/run`, { method: "POST", token, body: {} });
  assert.equal(run.status, 409);
  assert.equal(run.body.error.code, "RULE_DISABLED");

  await api(`/api/automation/rules/${b.body.rule.id}`, { method: "PATCH", token, body: { isEnabled: true } });
  assert.equal((await api("/api/automation/rules", { token })).body.workflows.find((w) => w.key === "resume_improvement").rule.isEnabled, true);
  assert.equal((await api(`/api/automation/rules/${b.body.rule.id}`, { method: "DELETE", token })).status, 204);
});

test("the weekly summary reports no activity rather than inventing some", async () => {
  const token = await registerUser("p14-auto-weekly@example.com");
  const rule = await api("/api/automation/rules", { method: "POST", token, body: { workflowKey: "weekly_summary", isEnabled: true, config: {} } });
  const run = await api(`/api/automation/rules/${rule.body.rule.id}/run`, { method: "POST", token, body: {} });
  assert.equal(run.body.execution.status, "succeeded");
  const summary = run.body.execution.results.find((r) => r.type === "summarise");
  assert.match(summary.result.text, /Nothing was recorded/i);
  assert.match(summary.result.text, /no activity has been inferred/i);
  assert.equal(summary.result.empty, true);
});

test("executions are listed with what was planned, approved and done", async () => {
  const token = await registerUser("p14-auto-history@example.com");
  const rule = await api("/api/automation/rules", { method: "POST", token, body: { workflowKey: "weekly_summary", isEnabled: true, config: {} } });
  await api(`/api/automation/rules/${rule.body.rule.id}/run`, { method: "POST", token, body: {} });

  const history = await api("/api/automation/executions", { token });
  assert.equal(history.status, 200);
  assert.ok(history.body.executions.length >= 1);
  const execution = history.body.executions[0];
  assert.ok(execution.trigger);
  assert.ok(execution.plannedActions.length > 0);
  assert.ok(execution.plannedActions.every((a) => a.preview && a.consequence));
  assert.ok(execution.statusLabel);
  assert.match(history.body.note, /what you approved/i);
});

// ── 8. Auth and isolation ────────────────────────────────────────────────────

test("every Phase 14 endpoint except the OAuth callback requires authentication", async () => {
  const id = "aaaaaaaaaaaaaaaaaaaaaaaa";
  const cases = [
    ["GET", "/api/integrations"],
    ["GET", "/api/integrations/google_calendar/status"],
    ["POST", "/api/integrations/google_calendar/connect"],
    ["POST", "/api/integrations/google_calendar/disconnect"],
    ["POST", "/api/integrations/google_calendar/sync"],
    ["GET", "/api/integrations/google_calendar/sync-history"],
    ["PUT", "/api/integrations/google_calendar/preferences"],
    ["PUT", "/api/integrations/email/preferences"],
    ["GET", "/api/integrations/google_drive/folders"],
    ["POST", "/api/integrations/google_drive/export"],
    ["GET", "/api/integrations/email/history"],
    ["GET", "/api/automation/rules"],
    ["POST", "/api/automation/rules"],
    ["PATCH", `/api/automation/rules/${id}`],
    ["DELETE", `/api/automation/rules/${id}`],
    ["POST", "/api/automation/pause-all"],
    ["GET", `/api/automation/rules/${id}/preview`],
    ["POST", `/api/automation/rules/${id}/run`],
    ["GET", "/api/automation/executions"],
    ["POST", `/api/automation/executions/${id}/retry`],
  ];
  for (const [method, path] of cases) {
    const res = await api(path, { method, body: ["GET", "DELETE"].includes(method) ? undefined : {} });
    assert.equal(res.status, 401, `${method} ${path} must require a token`);
  }
  // The callback cannot require one — the provider's redirect carries none.
  const callback = await api("/api/integrations/callback?state=aaaaaaaaaaaaaaaaaaaaaaaa&code=x");
  assert.equal(callback.status, 302, "the callback is reachable and redirects");
});

test("one user cannot see or touch another's integrations, rules or runs", async () => {
  const a = await registerUser("p14-iso-a@example.com");
  const b = await registerUser("p14-iso-b@example.com");
  await connectGoogle(a);
  const rule = await api("/api/automation/rules", { method: "POST", token: a, body: { workflowKey: "weekly_summary", isEnabled: true, config: {} } });
  const run = await api(`/api/automation/rules/${rule.body.rule.id}/run`, { method: "POST", token: a, body: {} });

  // B sees their own empty state, not A's connection.
  assert.equal((await api("/api/integrations/google_calendar/status", { token: b })).body.connected, false);
  assert.equal((await api("/api/integrations/google_calendar/sync-history", { token: b })).body.entries.length, 0);
  assert.equal((await api("/api/automation/executions", { token: b })).body.executions.length, 0);

  // And cannot act on A's records.
  assert.equal((await api(`/api/automation/rules/${rule.body.rule.id}`, { method: "PATCH", token: b, body: { isEnabled: false } })).status, 404);
  assert.equal((await api(`/api/automation/rules/${rule.body.rule.id}/run`, { method: "POST", token: b, body: {} })).status, 404);
  assert.equal((await api(`/api/automation/rules/${rule.body.rule.id}/preview`, { token: b })).status, 404);
  assert.equal((await api(`/api/automation/executions/${run.body.execution.id}/retry`, { method: "POST", token: b })).status, 404);
  assert.equal((await api(`/api/automation/rules/${rule.body.rule.id}`, { method: "DELETE", token: b })).status, 404);

  // A's connection is untouched by B's attempts.
  assert.equal((await api("/api/integrations/google_calendar/status", { token: a })).body.connected, true);
});

test("malformed input is rejected before anything is stored", async () => {
  const token = await registerUser("p14-input@example.com");
  assert.equal((await api("/api/integrations/not_a_provider/status", { token })).status, 400);
  assert.equal((await api("/api/automation/rules", { method: "POST", token, body: { workflowKey: "take_over_the_world", isEnabled: true } })).status, 400);
  assert.equal((await api("/api/integrations/google_calendar/preferences", { method: "PUT", token, body: {} })).status, 400);
  assert.equal((await api("/api/integrations/google_drive/export", { method: "POST", token, body: { sourceKind: "secrets", sourceId: "aaaaaaaaaaaaaaaaaaaaaaaa" } })).status, 400);
  // returnTo cannot be turned into an open redirect.
  assert.equal((await api("/api/integrations/google_calendar/connect", { method: "POST", token, body: { returnTo: "https://evil.example.com" } })).status, 400);
  assert.equal((await api("/api/integrations/google_calendar/connect", { method: "POST", token, body: { returnTo: "//evil.example.com" } })).status, 400);
});
