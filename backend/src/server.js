import { loadEnv } from "./config/env.js";
import { getPrisma, disconnectPrisma } from "./config/prisma.js";
import { createApp, aiRequestBudgetMs } from "./app.js";
import { logger } from "./utils/logger.js";

let env;
try {
  env = loadEnv();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

if (!env.LLM_CONFIGURED) {
  logger.warn("LLM_API_KEY is not set — AI analysis endpoints will return 503 until it is configured. Demo mode in the frontend still works.");
}

const prisma = getPrisma();
const app = createApp({ env, prisma });

const server = app.listen(env.PORT, () => {
  logger.info("API listening", { port: env.PORT, provider: env.LLM_PROVIDER, model: env.LLM_MODEL, origins: env.FRONTEND_ORIGINS, aiRequestBudgetMs: aiRequestBudgetMs(env) });
});
// Node's HTTP server defaults (requestTimeout 300 s, headersTimeout 60 s) would reset long AI requests
// before Express's own per-route timeout fires; align them with the AI budget.
server.requestTimeout = aiRequestBudgetMs(env) + 60_000;
server.headersTimeout = 65_000;
server.keepAliveTimeout = 65_000;

async function shutdown(signal) {
  logger.info("Shutting down", { signal });
  server.close(async () => {
    await disconnectPrisma();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// A crash that is not logged is a crash nobody can fix. Node's default for an
// unhandled rejection is already to exit; these handlers make sure the reason
// is on record first, and that the process still exits rather than carrying on
// in an unknown state.
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", { name: reason?.name, message: reason?.message });
  shutdown("unhandledRejection");
});
process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception", { name: err?.name, message: err?.message });
  shutdown("uncaughtException");
});
