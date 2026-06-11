import { env } from "../../config/env.js";
import { AppError } from "../../shared/errors/app-error.js";
import type { CreatePaymentLinkInput, PaymentProvider } from "./payment.provider.js";

type PaystackInitializeResponse = {
  status?: boolean;
  message?: string;
  data?: {
    authorization_url?: string;
    reference?: string;
  };
};

type PaystackVerifyResponse = {
  status?: boolean;
  data?: {
    status?: string;
    reference?: string;
  };
};

export const paystackPaymentProvider: PaymentProvider = {
  async createPaymentLink(input: CreatePaymentLinkInput) {
    if (!env.PAYSTACK_SECRET_KEY) {
      throw new AppError(500, "PAYSTACK_SECRET_KEY is not configured.", "PAYMENT_PROVIDER_NOT_CONFIGURED");
    }

    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: Math.round(input.amount * 100),
        email: input.email ?? "customer@chowcall.ng",
        reference: input.reference,
        metadata: {
          ...input.metadata,
          phone: input.phone,
        },
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as PaystackInitializeResponse;
    if (!response.ok || !payload.status || !payload.data?.authorization_url) {
      throw new AppError(
        response.status || 502,
        payload.message ?? "Paystack payment link creation failed.",
        "PAYSTACK_INITIALIZE_FAILED",
        payload
      );
    }

    return {
      provider: "paystack" as const,
      reference: payload.data.reference ?? input.reference,
      authorizationUrl: payload.data.authorization_url,
    };
  },

  async verify(reference: string) {
    if (!env.PAYSTACK_SECRET_KEY) {
      throw new AppError(500, "PAYSTACK_SECRET_KEY is not configured.", "PAYMENT_PROVIDER_NOT_CONFIGURED");
    }

    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` },
    });
    const payload = (await response.json().catch(() => ({}))) as PaystackVerifyResponse;

    if (!response.ok || !payload.status) {
      throw new AppError(response.status || 502, "Paystack payment verification failed.", "PAYSTACK_VERIFY_FAILED", payload);
    }

    return { paid: payload.data?.status === "success", raw: payload };
  },
};
