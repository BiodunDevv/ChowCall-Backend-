import { createServer } from "node:http";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { connectDatabase } from "./config/database.js";
import { connectRedis } from "./config/redis.js";
import { logger } from "./config/logger.js";

async function bootstrap() {
  await connectDatabase();
  await connectRedis();

  const app = createApp();
  const server = createServer(app);

  server.listen(env.PORT, () => {
    logger.info(renderStartupBanner());
  });
}

bootstrap().catch((error) => {
  logger.error("Failed to start ChowCall API", error);
  process.exit(1);
});

function renderStartupBanner() {
  const baseUrl = normalizeLocalUrl(env.API_BASE_URL);
  const rows = [
    ["Status", "Ready"],
    ["Environment", env.NODE_ENV],
    ["Local", baseUrl],
    ["Docs", `${baseUrl}${env.SWAGGER_PATH}`],
    ["Health", `${baseUrl}/health`],
    ["Database", "MongoDB connected"],
    ["Cache", "Redis connected"],
  ];
  const labelWidth = Math.max(...rows.map(([label]) => label.length));
  const body = rows.map(([label, value]) => `  ${label.padEnd(labelWidth)}  ${value}`).join("\n");

  return [
    "",
    "ChowCall API",
    "-----------",
    body,
    "",
  ].join("\n");
}

function normalizeLocalUrl(url: string) {
  if (url.startsWith("https://localhost") || url.startsWith("https://127.0.0.1")) {
    return url.replace("https://", "http://");
  }

  return url;
}
