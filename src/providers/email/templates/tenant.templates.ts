import { renderEmailLayout } from "./partials/layout.js";

export function escalationAlertEmail(input: {
  tenantName: string;
  reason: string;
  dashboardUrl: string;
}) {
  return renderEmailLayout({
    previewText: `ChowCall needs help with a ${input.tenantName} customer request.`,
    eyebrow: "Escalation",
    title: "Live confirm needed",
    body: `The AI paused because it needs manager input.\nReason: ${input.reason}`,
    action: { label: "Review escalation", href: input.dashboardUrl },
  });
}

export function quotaWarningEmail(input: {
  tenantName: string;
  usedPercent: string;
  billingUrl: string;
}) {
  return renderEmailLayout({
    previewText: `${input.tenantName} has used ${input.usedPercent} of included web voice usage.`,
    eyebrow: "Usage warning",
    title: "Voice quota warning",
    body: `${input.tenantName} has used ${input.usedPercent} of included web voice usage.\nReview billing settings to avoid service interruption.`,
    action: { label: "Review billing", href: input.billingUrl },
  });
}

export function dailySummaryEmail(input: {
  tenantName: string;
  paidOrders: string;
  revenue: string;
  missedCalls: string;
  dashboardUrl: string;
}) {
  return renderEmailLayout({
    previewText: `${input.tenantName} daily ChowCall summary.`,
    eyebrow: "Daily summary",
    title: "Today on ChowCall",
    body: `Here is the daily restaurant summary for ${input.tenantName}.`,
    details: [
      { label: "Paid orders", value: input.paidOrders },
      { label: "Revenue collected", value: input.revenue },
      { label: "Unfinished voice orders", value: input.missedCalls },
    ],
    action: { label: "Open dashboard", href: input.dashboardUrl },
  });
}
