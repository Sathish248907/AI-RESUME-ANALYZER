import { loadEnv } from "./config/env.js";
import { getPrisma, disconnectPrisma } from "./config/prisma.js";
import { createApp } from "./app.js";
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
  logger.info("API listening", { port: env.PORT, provider: env.LLM_PROVIDER, model: env.LLM_MODEL, origins: env.FRONTEND_ORIGINS });
});

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
