import { Router } from "express";
import { z } from "zod";
import { brevoEmailProvider } from "../../providers/email/brevo-email.provider.js";
import { Message } from "./message.model.js";

const testEmailSchema = z.object({
  email: z.string().email(),
  message: z.string().min(3).max(480).optional(),
});

export const notificationRouter = Router();

notificationRouter.get("/", (_req, res) => {
  res.json({
    module: "notifications",
    status: "ready",
    providers: {
      email: "brevo",
    },
  });
});

notificationRouter.post("/test-email", async (req, res, next) => {
  try {
    const input = testEmailSchema.parse(req.body);
    const body = input.message ?? "Your ChowCall email notification is working.";
    const result = await brevoEmailProvider.send({
      to: input.email,
      subject: "ChowCall notification test",
      html: `<p>${body}</p>`,
    });

    const message = await Message.create({
      channel: "email",
      provider: "brevo",
      recipient: input.email,
      messageType: "test_email",
      body,
      status: "sent",
      providerMessageId: result.id,
    });

    res.status(202).json({
      data: {
        ok: true,
        provider: "brevo",
        email: input.email,
        providerMessageId: result.id,
        status: "sent",
        messageId: message.id,
      },
    });
  } catch (error) {
    next(error);
  }
});
