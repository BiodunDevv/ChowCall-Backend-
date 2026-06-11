export const orderStatuses = [
  "DRAFT",
  "PRICED",
  "PENDING_PAYMENT",
  "CONFIRMED",
  "SENT_TO_KITCHEN",
  "PREPARING",
  "READY",
  "OUT_FOR_DELIVERY",
  "COMPLETED",
  "EXPIRED",
  "CANCELLED",
  "FAILED_PAYMENT",
  "ESCALATED",
  "REFUNDED",
] as const;

export type OrderStatus = (typeof orderStatuses)[number];
