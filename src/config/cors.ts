import cors from "cors";
import { env } from "./env.js";

function isAllowedOrigin(origin: string): boolean {
  // Exact match against the configured list
  if (env.CORS_ORIGINS_LIST.includes(origin)) return true;

  try {
    const url = new URL(origin);
    const hostname = url.hostname;

    // Allow any subdomain of localhost (e.g. tenant.localhost)
    if (hostname === "localhost" || hostname.endsWith(".localhost")) return true;

    // Allow any subdomain of 172.20.10.4 for local network / mobile testing
    if (hostname === "172.20.10.4" || hostname.endsWith(".172.20.10.4")) return true;

    // Allow any subdomain of chowcall.ng in production
    if (hostname === "chowcall.ng" || hostname.endsWith(".chowcall.ng")) return true;
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
