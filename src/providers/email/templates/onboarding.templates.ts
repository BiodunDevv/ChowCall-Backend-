import { renderEmailLayout } from "./partials/layout.js";

export function onboardingChecklistEmail(input: {
  tenantName: string;
  dashboardUrl: string;
  remainingSteps: string[];
}) {
  return renderEmailLayout({
    previewText: `${input.tenantName} has setup steps remaining before going live.`,
    eyebrow: "Onboarding",
    title: "Finish your ChowCall setup",
    body: `Complete these setup steps before going live:\n${input.remainingSteps
      .map((step) => `• ${step}`)
      .join("\n")}`,
    action: { label: "Continue setup", href: input.dashboardUrl },
  });
}

export function testCallResultEmail(input: {
  tenantName: string;
  status: "CLI passed" | "CLI missing" | "CLI inconsistent";
  dashboardUrl: string;
}) {
  return renderEmailLayout({
    previewText: `Test call result for ${input.tenantName}: ${input.status}.`,
    eyebrow: "Phone setup",
    title: "Test call result",
    body:
      input.status === "CLI passed"
        ? "Caller ID passed. ChowCall can detect caller numbers when available."
        : "Caller ID was not reliable. ChowCall will still work by asking customers to confirm their phone number.",
    details: [{ label: "Result", value: input.status }],
    action: { label: "Open phone settings", href: input.dashboardUrl },
  });
}
