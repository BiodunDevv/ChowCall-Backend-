export type CreatePaymentLinkInput = {
  amount: number;
  email?: string;
  phone?: string;
  reference: string;
  metadata?: Record<string, unknown>;
};

export type PaymentLink = {
  provider: "paystack" | "flutterwave";
  reference: string;
  authorizationUrl: string;
};

export interface PaymentProvider {
  createPaymentLink(input: CreatePaymentLinkInput): Promise<PaymentLink>;
  verify(reference: string): Promise<{ paid: boolean; raw?: unknown }>;
}
