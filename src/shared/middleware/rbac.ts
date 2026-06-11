import type { RequestHandler } from "express";
import type { Role } from "../constants/roles.js";
import { AppError } from "../errors/app-error.js";

export function requireRoles(...allowed: Role[]): RequestHandler {
  return (req, _res, next) => {
    const roles = req.user?.roles ?? [];
    const permitted = roles.some((role) => allowed.includes(role));
    if (!permitted) {
      next(new AppError(403, "You do not have permission for this action", "FORBIDDEN"));
      return;
    }
    next();
  };
}
