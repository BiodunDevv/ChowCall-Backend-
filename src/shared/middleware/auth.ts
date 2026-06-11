import type { RequestHandler } from "express";
import { AppError } from "../errors/app-error.js";
import { verifyAccessToken } from "../security/jwt.js";

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.header("authorization");
  const bearerToken = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const cookieToken = parseCookie(req.header("cookie") ?? "").chowcall_access;
  const token = bearerToken ?? cookieToken;

  if (!token) {
    next(new AppError(401, "Missing bearer token", "UNAUTHENTICATED"));
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = {
      id: payload.sub,
      tenantId: payload.tenantId,
      roles: payload.roles,
    };
    next();
  } catch {
    next(new AppError(401, "Invalid or expired token", "UNAUTHENTICATED"));
  }
};

function parseCookie(header: string) {
  return Object.fromEntries(
    header.split(";").map((part) => {
      const [key, ...value] = part.trim().split("=");
      return [key, decodeURIComponent(value.join("="))];
    })
  );
}
