import type { NextFunction, Request, Response } from "express";
import { logger } from "../../config/logger.js";

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const startedAt = process.hrtime.bigint();
  const method = req.method.padEnd(7);
  const path = req.originalUrl;
  const requestId = req.requestId;

  logger.info(`Request  ${method} ${path}  id=${requestId}`);

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const status = res.statusCode;
    const level = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
    const message = `Response ${method} ${path}  ${status}  ${durationMs.toFixed(1)}ms  id=${requestId}`;

    if (level === "error") {
      logger.error(message);
      return;
    }

    if (level === "warn") {
      logger.warn(message);
      return;
    }

    logger.info(message);
  });

  next();
}
