import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { corsMiddleware } from "./config/cors.js";
import { env } from "./config/env.js";
import { requestId } from "./shared/middleware/request-id.js";
import { requestLogger } from "./shared/middleware/request-logger.js";
import { errorHandler } from "./shared/middleware/error-handler.js";
import { notFound } from "./shared/middleware/not-found.js";
import { rawWebhookBody } from "./shared/middleware/raw-webhook-body.js";
import { setupSwagger } from "./config/swagger.js";
import { v1Router } from "./v1/router.js";
import { renderWelcomePage } from "./v1/welcome/welcome-page.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const assetRoot = path.resolve(dirname, "../src/assets");

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(requestId);
  app.use(requestLogger);
  app.use(helmet());
  app.use(corsMiddleware);
  app.use(
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      limit: env.RATE_LIMIT_MAX,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    })
  );
  app.use("/assets", express.static(assetRoot, { maxAge: "7d", immutable: true }));
  app.use("/v1/payments/webhooks", rawWebhookBody);
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false }));

  app.get("/", (_req, res) => {
    res.type("html").send(renderWelcomePage());
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: env.APP_NAME, version: "1.0.0" });
  });

  app.use("/v1", v1Router);
  setupSwagger(app);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
