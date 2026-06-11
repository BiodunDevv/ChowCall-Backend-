import { randomBytes } from "node:crypto";

export function createReference(prefix: string) {
  const suffix = randomBytes(9).toString("hex").toUpperCase();
  return `${prefix}_${Date.now()}_${suffix}`;
}
