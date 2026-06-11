import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { twilioSmsProvider } from "../../providers/messaging/twilio-sms.provider.js";
import { normalizeNigeriaPhone } from "../../shared/utils/phone.js";
import { Message } from "./message.model.js";

const testSmsSchema = z.object({
  phone: z.string().min(7),
  message: z.string().min(3).max(480).optional(),
});

export const notificationRouter = Router();

notificationRouter.get("/", (_req, res) => {
  res.json({
    module: "notifications",
    status: "ready",
    providers: {
      sms: env.SMS_PROVIDER,
      whatsapp: env.WHATSAPP_PROVIDER,
    },
  });
});

notificationRouter.post("/test-sms", async (req, res, next) => {
  try {
    const input = testSmsSchema.parse(req.body);
    const body =
      input.message ??
      "Your ChowCall Twilio SMS test is working. You can now send order and kitchen notifications.";
    const normalizedPhone = normalizeNigeriaPhone(input.phone);
    const result = await twilioSmsProvider.send({
      to: normalizedPhone,
      body,
      channel: "sms",
    });

    const message = await Message.create({
      channel: "sms",
      provider: "twilio",
      recipient: input.phone,
      normalizedRecipient: normalizedPhone,
      messageType: "test_sms",
      body,
      status: result.status,
      providerMessageId: result.providerMessageId,
      rawResponse: result.metadata,
    });

    res.status(202).json({
      data: {
        ok: true,
        provider: "twilio",
        normalizedPhone,
        providerMessageId: result.providerMessageId,
        status: result.status,
        messageId: message.id,
      },
    });
  } catch (error) {
    next(error);
  }
});
