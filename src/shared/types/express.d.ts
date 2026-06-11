import type { Role } from "../constants/roles.js";

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      user?: {
        id: string;
        tenantId?: string;
        roles: Role[];
      };
    }
  }
}
