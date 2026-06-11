import { env } from "../../config/env.js";
import { AppError } from "../../shared/errors/app-error.js";
import type { EmailProvider } from "./email.provider.js";

type BrevoResponse = {
  messageId?: string;
};

function parseSender(sender: string) {
  const match = sender.match(/^(.*?)\s*<(.+)>$/);
  if (!match) return { email: sender };
  return { name: match[1].trim(), email: match[2].trim() };
}

export const brevoEmailProvider: EmailProvider = {
  async send(input) {
    if (!env.BREVO_API_KEY) {
      throw new AppError(500, "BREVO_API_KEY is not configured", "EMAIL_PROVIDER_NOT_CONFIGURED");
    }

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": env.BREVO_API_KEY,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: parseSender(env.EMAIL_FROM),
        to: [{ email: input.to }],
        replyTo: input.replyTo ? parseSender(input.replyTo) : undefined,
        subject: input.subject,
        htmlContent: input.html,
        textContent: input.text,
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      throw new AppError(502, "Brevo email delivery failed", "EMAIL_DELIVERY_FAILED", details);
    }

    const body = (await response.json()) as BrevoResponse;
    return { id: body.messageId ?? "brevo-accepted" };
  },
};
