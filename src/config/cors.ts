import cors from "cors";
import { env } from "./env.js";

function isAllowedOrigin(origin: string): boolean {
  // Exact match against the configured list
  if (env.CORS_ORIGINS_LIST.includes(origin)) return true;

  try {
    const url = new URL(origin);
    const hostname = url.hostname;

    // Allow localhost (all tenant paths are now served from same origin)
    if (hostname === "localhost") return true;

    // Allow direct LAN access for mobile / device testing
    if (hostname === "172.20.10.4") return true;

    // Allow chowcall.live in production (single domain, path-based routing)
    if (hostname === "chowcall.live" || hostname === "www.chowcall.live") return true;

    // Allow Vercel preview deployments
    if (hostname.endsWith(".vercel.app")) return true;
  } catch {
    // Malformed origin — deny
  }

  return false;
}

export const corsMiddleware = cors({
  origin(origin, callback) {
    // Same-origin requests (e.g. server-side) have no Origin header
    if (!origin) {
      callback(null, true);
      return;
    }

    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS origin not allowed: ${origin}`));
  },
  credentials: env.CORS_CREDENTIALS,
  methods: env.CORS_METHODS_LIST,
});
