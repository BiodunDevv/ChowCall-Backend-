import { AppError } from "../../shared/errors/app-error.js";
import type { MessagingProvider } from "./messaging.provider.js";

export const disabledWhatsappProvider: MessagingProvider = {
  async send() {
    throw new AppError(
      501,
      "WhatsApp messaging is not enabled yet. Configure a paid WhatsApp provider before using this channel.",
      "WHATSAPP_PROVIDER_DISABLED"
    );
  },
};
