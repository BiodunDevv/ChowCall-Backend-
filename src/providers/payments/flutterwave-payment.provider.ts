import { env } from "../../config/env.js";
import { AppError } from "../../shared/errors/app-error.js";
import type { CreatePaymentLinkInput, PaymentProvider } from "./payment.provider.js";

type FlwInitResponse = {
  status?: string;
  message?: string;
  data?: {
    link?: string;
  };
};

type FlwVerifyResponse = {
  status?: string;
  data?: {
    status?: string;
    flw_ref?: string;
    tx_ref?: string;
  };
};

export const flutterwavePaymentProvider: PaymentProvider = {
  async createPaymentLink(input: CreatePaymentLinkInput) {
    if (!env.FLUTTERWAVE_SECRET_KEY) {
      throw new AppError(500, "FLUTTERWAVE_SECRET_KEY is not configured.", "PAYMENT_PROVIDER_NOT_CONFIGURED");
    }

    const response = await fetch("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.FLUTTERWAVE_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tx_ref: input.reference,
        amount: input.amount,
        currency: "NGN",
        redirect_url: `${env.FRONTEND_BASE_URL ?? "https://chowcall.live"}/payment/callback`,
        customer: {
          email: input.email ?? "customer@chowcall.ng",
          phonenumber: input.phone ?? "",
          name: "Customer",
        },
        meta: input.metadata,
        customizations: {
          title: "ChowCall Payment",
          description: "Order payment via ChowCall",
        },
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as FlwInitResponse;
    if (!response.ok || payload.status !== "success" || !payload.data?.link) {
      throw new AppError(
        response.status || 502,
        payload.message ?? "Flutterwave payment link creation failed.",
        "FLUTTERWAVE_INITIALIZE_FAILED",
        payload
      );
    }

    return {
      provider: "flutterwave" as const,
      reference: input.reference,
      authorizationUrl: payload.data.link,
    };
  },

  async verify(reference: string) {
    if (!env.FLUTTERWAVE_SECRET_KEY) {
      throw new AppError(500, "FLUTTERWAVE_SECRET_KEY is not configured.", "PAYMENT_PROVIDER_NOT_CONFIGURED");
    }

    const response = await fetch(
      `https://api.flutterwave.com/v3/transactions?tx_ref=${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${env.FLUTTERWAVE_SECRET_KEY}` } }
    );
    const payload = (await response.json().catch(() => ({}))) as { status?: string; data?: FlwVerifyResponse["data"][] };

    if (!response.ok || payload.status !== "success") {
      throw new AppError(response.status || 502, "Flutterwave payment verification failed.", "FLUTTERWAVE_VERIFY_FAILED", payload);
    }

    const tx = payload.data?.[0];
    return { paid: tx?.status === "successful", raw: payload };
  },
};
