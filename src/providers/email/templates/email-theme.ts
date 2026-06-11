import { env } from "../../../config/env.js";

export const emailTheme = {
  appName: "ChowCall",
  logoUrl: env.BRAND_LOGO_URL ?? "https://www.chowcall.live/chowcall-logo.png",
  background: "#f7f1e8",
  card: "#fffaf2",
  text: "#221817",
  muted: "#6f6258",
  border: "#ded1c1",
  primary: "#00786f",
  primaryForeground: "#ffffff",
  accent: "#00786f",
};

export type EmailAction = {
  label: string;
  href: string;
};

export type EmailTemplateInput = {
  previewText: string;
  title: string;
  eyebrow?: string;
  body: string;
  action?: EmailAction;
  secondaryAction?: EmailAction;
  details?: Array<{ label: string; value: string }>;
  footerNote?: string;
};
