#!/usr/bin/env node
/**
 * check-env.js — a deploy gate.
 *
 * Loads the environment exactly as the server does and prints what would stop a
 * production start. Run it in CI and as the last step before a release: it
 * fails the same way the server would, but without needing a database, a
 * provider key or a port.
 *
 *   npm run check:env                      # check the current .env
 *   NODE_ENV=production npm run check:env  # check it as production would see it
 */
import { loadEnv, productionProblems } from "../src/config/env.js";

let env;
try {
  env = loadEnv();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const problems = productionProblems(env);
if (problems.length === 0) {
  console.log(`[check:env] OK — this configuration would start in production (NODE_ENV=${env.NODE_ENV}).`);
} else {
  console.error(`[check:env] ${problems.length} problem(s) would block a production start:`);
  for (const p of problems) console.error(`  - ${p}`);
  // Outside production this is advisory: a developer's .env is allowed to be a
  // developer's .env. In production the server itself would already have refused.
  process.exit(env.NODE_ENV === "production" ? 1 : 0);
}
