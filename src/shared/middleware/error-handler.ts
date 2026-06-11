import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { logger } from "../../config/logger.js";
import { AppError } from "../errors/app-error.js";

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof ZodError) {
    logger.warn(`Error    ${req.method.padEnd(7)} ${req.originalUrl}  VALIDATION_ERROR  id=${req.requestId}`, {
      details: error.flatten(),
    });
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: error.flatten(),
        requestId: req.requestId,
      },
    });
    return;
  }

  if (error instanceof AppError) {
    const log = error.statusCode >= 500 ? logger.error : logger.warn;
    log(`Error    ${req.method.padEnd(7)} ${req.originalUrl}  ${error.code}  id=${req.requestId}`, {
      message: error.message,
      details: error.details,
    });
    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        requestId: req.requestId,
      },
    });
    return;
  }

  logger.error(`Error    ${req.method.padEnd(7)} ${req.originalUrl}  INTERNAL_SERVER_ERROR  id=${req.requestId}`, {
    message: error instanceof Error ? error.message : "Unknown error",
    stack: error instanceof Error ? error.stack : undefined,
  });

  res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred",
      requestId: req.requestId,
    },
  });
};
