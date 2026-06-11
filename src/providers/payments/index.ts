import { AppError } from "../../shared/errors/app-error.js";
import { paystackPaymentProvider } from "./paystack-payment.provider.js";

export function getPaymentProvider(provider?: "paystack" | "flutterwave") {
  const selected = provider ?? "paystack";

  if (selected === "paystack") {
    return paystackPaymentProvider;
  }

  throw new AppError(501, "Flutterwave provider is not implemented yet.", "PAYMENT_PROVIDER_NOT_IMPLEMENTED");
}
