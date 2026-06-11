export const roles = [
  "platform_owner",
  "platform_admin",
  "tenant_owner",
  "tenant_admin",
  "manager",
  "kitchen_staff",
  "support_agent",
  "delivery_staff",
  "viewer",
] as const;

export type Role = (typeof roles)[number];
