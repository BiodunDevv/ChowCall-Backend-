export function tenantQuery<T extends Record<string, unknown>>(tenantId: string, query?: T) {
  return { ...(query ?? {}), tenantId };
}
