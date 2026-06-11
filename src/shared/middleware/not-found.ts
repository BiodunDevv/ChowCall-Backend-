import type { RequestHandler } from "express";
import { AppError } from "../errors/app-error.js";

export const notFound: RequestHandler = (req, _res, next) => {
  next(new AppError(404, `Route not found: ${req.method} ${req.path}`, "ROUTE_NOT_FOUND"));
};
