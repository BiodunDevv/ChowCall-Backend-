import { Buffer } from "node:buffer";
import { env } from "../../config/env.js";
import { AppError } from "../../shared/errors/app-error.js";
import { normalizeNigeriaPhone } from "../../shared/utils/phone.js";
import type { MessageInput, MessagingProvider } from "./messaging.provider.js";

type TwilioMessageResponse = {
  sid?: string;
  status?: string;
  error_message?: string | null;
};

export const twilioSmsProvider: MessagingProvider = {
  async send(input: MessageInput) {
    if (input.channel !== "sms") {
      throw new AppError(400, "Twilio is configured for SMS only.", "UNSUPPORTED_MESSAGE_CHANNEL");
    }

    if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM_NUMBER) {
      throw new AppError(500, "Twilio SMS credentials are not configured.", "SMS_PROVIDER_NOT_CONFIGURED");
    }

    const to = normalizeSmsRecipient(input.to);
    const body = new URLSearchParams({
      To: to,
      From: env.TWILIO_FROM_NUMBER,
      Body: input.body,
    });
    const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64");

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(env.TWILIO_ACCOUNT_SID)}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      }
    );

    const payload = (await response.json().catch(() => ({}))) as TwilioMessageResponse;

    if (!response.ok || payload.error_message) {
      throw new AppError(
        response.status || 502,
        payload.error_message ?? "Twilio SMS request failed.",
        "TWILIO_SMS_REQUEST_FAILED",
        payload
      );
    }

    return {
      providerMessageId: payload.sid ?? "twilio-message",
      status: payload.status === "sent" || payload.status === "delivered" ? "sent" : "queued",
      metadata: {
        provider: "twilio",
        normalizedPhone: to,
        raw: payload,
      },
    };
  },
};

function normalizeSmsRecipient(phone: string) {
  const trimmed = phone.trim();
  if (trimmed.startsWith("+")) {
    return trimmed;
  }

  return normalizeNigeriaPhone(trimmed);
}
