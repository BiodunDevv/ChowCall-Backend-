import { paystackPaymentProvider } from "./paystack-payment.provider.js";
import { flutterwavePaymentProvider } from "./flutterwave-payment.provider.js";

export function getPaymentProvider(provider?: "paystack" | "flutterwave") {
  if (provider === "flutterwave") return flutterwavePaymentProvider;
  return paystackPaymentProvider;
}
