import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Inline the logo as a base64 data URI so it renders in every email client
// without depending on a live public URL.
function loadLogoDataUri(): string {
  try {
    const dir = dirname(fileURLToPath(import.meta.url));
    const logoPath = join(dir, "../../../../assets/brand/chowcall-logo.png");
    const buf = readFileSync(logoPath);
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    // Fallback to hosted URL if the file isn't available (e.g. in tests / CI)
    return "https://chowcall.ng/chowcall-logo.png";
  }
}

export const emailTheme = {
  appName: "ChowCall",
  logoUrl: loadLogoDataUri(),
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
