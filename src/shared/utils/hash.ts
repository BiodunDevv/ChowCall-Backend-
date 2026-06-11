import { createHash } from "node:crypto";

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeAddress(address: string) {
  return address.trim().toLowerCase().replace(/\s+/g, " ");
}
