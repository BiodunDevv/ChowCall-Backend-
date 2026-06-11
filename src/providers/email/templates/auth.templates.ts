import { renderEmailLayout } from "./partials/layout.js";

export function welcomeTenantEmail(input: {
  name: string;
  tenantName: string;
  dashboardUrl: string;
}) {
  const firstName = input.name.split(" ")[0] ?? input.name;
  return renderEmailLayout({
    previewText: `Welcome to ChowCall, ${firstName}. Your restaurant workspace is ready.`,
    eyebrow: "Welcome to ChowCall",
    title: `You're in, ${firstName}!`,
    body: [
      `${input.tenantName} is now live on ChowCall.`,
      "You're just a few steps away from taking orders by phone — without lifting a finger.",
      "Complete your setup to go live: add your menu, delivery pricing, payment details, and kitchen notification number.",
    ].join("\n"),
    action: { label: "Complete setup", href: input.dashboardUrl },
    details: [
      { label: "Workspace", value: input.tenantName },
      { label: "Account", value: input.name },
    ],
    footerNote:
      "You're receiving this because you just created a ChowCall account. If this wasn't you, contact support.",
  });
}

export function loginOtpEmail(input: {
  name: string;
  code: string;
  tenantName?: string;
  role?: string;
}) {
  const firstName = input.name.split(" ")[0] ?? input.name;
  const roleLabel = input.role
    ? input.role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : null;

  return renderEmailLayout({
    previewText: `${input.code} is your ChowCall sign-in code. Expires in 10 minutes.`,
    eyebrow: "Sign-in code",
    title: `Your code is ${input.code}`,
    body: [
      `Hi ${firstName},`,
      `Use the code above to finish signing in to ChowCall${input.tenantName ? ` — ${input.tenantName}` : ""}.`,
      "This code expires in 10 minutes and can only be used once.",
    ].join("\n"),
    details: [
      { label: "One-time code", value: input.code },
      ...(input.tenantName ? [{ label: "Workspace", value: input.tenantName }] : []),
      ...(roleLabel ? [{ label: "Access level", value: roleLabel }] : []),
    ],
    footerNote:
      "If you didn't try to sign in to ChowCall, someone may have entered your email. You can ignore this — your account is safe.",
  });
}

export function passwordResetEmail(input: { name: string; resetUrl: string }) {
  const firstName = input.name.split(" ")[0] ?? input.name;
  return renderEmailLayout({
    previewText: "Reset your ChowCall password. This link expires in 1 hour.",
    eyebrow: "Password reset",
    title: "Reset your password",
    body: [
      `Hi ${firstName},`,
      "We received a request to reset the password on your ChowCall account.",
      "Click the button below to choose a new password. This link is valid for 1 hour.",
    ].join("\n"),
    action: { label: "Reset password", href: input.resetUrl },
    footerNote:
      "If you didn't request a password reset, you can safely ignore this email. Your password won't change.",
  });
}

export function staffInviteEmail(input: {
  inviterName: string;
  tenantName: string;
  role: string;
  inviteUrl: string;
}) {
  const roleLabel = input.role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const roleText = input.role.replace(/_/g, " ");
  return renderEmailLayout({
    previewText: `${input.inviterName} invited you to join ${input.tenantName} on ChowCall.`,
    eyebrow: "Staff invite",
    title: `Join ${input.tenantName}`,
    body: [
      `${input.inviterName} has invited you to ChowCall as ${roleText} at ${input.tenantName}.`,
      "Accept the invite to access the restaurant workspace and start managing orders.",
    ].join("\n"),
    action: { label: "Accept invite", href: input.inviteUrl },
    details: [
      { label: "Restaurant", value: input.tenantName },
      { label: "Your role", value: roleLabel },
      { label: "Invited by", value: input.inviterName },
    ],
    footerNote: `If you weren't expecting an invite from ${input.tenantName}, you can safely ignore this email.`,
  });
}
