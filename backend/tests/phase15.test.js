/**
 * Phase 15 — production readiness.
 *
 * These tests cover the things that only matter once the app leaves a laptop:
 * that a misconfigured production environment refuses to boot, that readiness
 * tells the truth when the database is gone, that every response can be traced
 * back to a log line, and that failures never carry internals to the client.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { loadEnv, productionProblems } from "../src/config/env.js";
import { createApp } from "../src/app.js";
import { TEST_ENV, fakeLlm, fakePrisma } from "./fixtures.js";

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

async function api(path, { method = "GET", headers = {} } = {}) {
  await ensureServer();
  const res = await fetch(baseUrl + path, {
    method,
    headers: { Origin: "http://localhost:3001", ...headers },
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
}

after(() => new Promise((r) => (server ? server.close(r) : r())));

// ── Environment guards ───────────────────────────────────────────────────────

const PROD_BASE = {
  ...TEST_ENV,
  NODE_ENV: "production",
  FRONTEND_URL: "https://app.example.com",
  APP_BASE_URL: "https://api.example.com",
  JWT_SECRET: "a-genuinely-random-secret-of-sufficient-length-1234",
};

test("a well-formed production config has no problems", () => {
  assert.deepEqual(productionProblems(loadEnv(PROD_BASE)), []);
});

test("production refuses to start on the example JWT secret", () => {
  assert.throws(
    () => loadEnv({ ...PROD_BASE, JWT_SECRET: "replace-with-a-long-random-secret-padding-here" }),
    /Refusing to start in production[\s\S]*JWT_SECRET is still the example value/
  );
});

test("production refuses a plain-http frontend origin", () => {
  assert.throws(
    () => loadEnv({ ...PROD_BASE, FRONTEND_URL: "http://app.example.com" }),
    /is not https/
  );
});

test("production refuses a localhost origin left in the allowlist", () => {
  assert.throws(
    () => loadEnv({ ...PROD_BASE, FRONTEND_URL: "https://app.example.com,http://localhost:3001" }),
    /still contains a localhost origin/
  );
});

test("production refuses an OAuth redirect base that is not https", () => {
  assert.throws(() => loadEnv({ ...PROD_BASE, APP_BASE_URL: "http://api.example.com" }), /APP_BASE_URL/);
});

test("production refuses a vault key that is not 32 bytes", () => {
  assert.throws(
    () => loadEnv({ ...PROD_BASE, INTEGRATION_ENCRYPTION_KEY: Buffer.from("too short").toString("base64") }),
    /exactly 32 bytes/
  );
});

test("production refuses smtp without a host or a from address", () => {
  assert.throws(() => loadEnv({ ...PROD_BASE, EMAIL_TRANSPORT: "smtp" }), /nothing would be delivered/);
});

test("the same problems are only warnings outside production", () => {
  // Development stays workable: http on localhost is normal there.
  const env = loadEnv({ ...TEST_ENV, FRONTEND_URL: "http://localhost:3001" });
  assert.equal(env.NODE_ENV, "test");
  assert.ok(productionProblems(env).length > 0, "localhost should be flagged for production");
});

// ── Health, readiness and operator detail ────────────────────────────────────

test("readiness fails with 503 when the database cannot be reached", async () => {
  await ensureServer();
  prisma.dbDown = true;
  try {
    const r = await api("/api/health/ready");
    assert.equal(r.status, 503);
    assert.equal(r.body.status, "not_ready");
    assert.equal(r.body.checks.database, "unavailable");
    // No driver name, no error text, no connection string fragment.
    assert.equal(/postgres|prisma|P1001|Can't reach/i.test(JSON.stringify(r.body)), false);
  } finally {
    prisma.dbDown = false;
  }
});

test("liveness still answers while the database is down", async () => {
  await ensureServer();
  prisma.dbDown = true;
  try {
    const r = await api("/api/health");
    assert.equal(r.status, 200, "liveness must not depend on the database");
  } finally {
    prisma.dbDown = false;
  }
});

test("health details are gated and report the database honestly", async () => {
  await ensureServer();
  prisma.dbDown = true;
  try {
    const r = await api("/api/health/details", { headers: { Authorization: "Bearer test-health-token" } });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, "not_ready");
    assert.equal(r.body.checks.database, "unavailable");
  } finally {
    prisma.dbDown = false;
  }
});

test("a token of the wrong length is rejected without a timing shortcut", async () => {
  const short = await api("/api/health/details", { headers: { Authorization: "Bearer x" } });
  assert.equal(short.status, 401);
  const long = await api("/api/health/details", { headers: { Authorization: "Bearer test-health-token-with-extra" } });
  assert.equal(long.status, 401);
});

// ── Request correlation ──────────────────────────────────────────────────────

test("every response carries a request id", async () => {
  const r = await api("/api/health");
  const id = r.headers.get("x-request-id");
  assert.ok(id && id.length >= 8, "expected an x-request-id header");
});

test("a caller-supplied request id is honoured when it is safe", async () => {
  const r = await api("/api/health", { headers: { "x-request-id": "edge-abc-123" } });
  assert.equal(r.headers.get("x-request-id"), "edge-abc-123");
});

test("an unsafe request id is replaced rather than echoed", async () => {
  // A header value containing CRLF would be response splitting if echoed.
  const r = await api("/api/health", { headers: { "x-request-id": "bad id with spaces" } });
  assert.notEqual(r.headers.get("x-request-id"), "bad id with spaces");
  assert.ok(r.headers.get("x-request-id"));
});

test("two requests get different ids", async () => {
  const a = await api("/api/health");
  const b = await api("/api/health");
  assert.notEqual(a.headers.get("x-request-id"), b.headers.get("x-request-id"));
});

// ── Error surface ────────────────────────────────────────────────────────────

test("an unknown route returns a structured 404 and no stack", async () => {
  const r = await api("/api/definitely-not-a-route");
  assert.equal(r.status, 404);
  assert.equal(r.body.error.code, "NOT_FOUND");
  assert.equal("stack" in r.body.error, false);
});

test("CORS refuses an origin that is not on the allowlist", async () => {
  await ensureServer();
  const res = await fetch(`${baseUrl}/api/health`, { headers: { Origin: "https://evil.example" } });
  assert.equal(res.headers.get("access-control-allow-origin"), null);
});

test("security headers are set by helmet", async () => {
  const r = await api("/api/health");
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.equal(r.headers.get("x-powered-by"), null);
});
