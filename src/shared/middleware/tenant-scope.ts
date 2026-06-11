import type { RequestHandler } from "express";
import { AppError } from "../errors/app-error.js";

export const requireTenant: RequestHandler = (req, _res, next) => {
  if (!req.user?.tenantId) {
    next(new AppError(403, "Tenant context is required", "TENANT_REQUIRED"));
    return;
  }
  next();
};
