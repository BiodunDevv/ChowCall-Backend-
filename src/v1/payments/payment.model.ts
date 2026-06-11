import { model, Schema } from "mongoose";
import { tenantFields, timestamps } from "../shared/base-model.js";

const paymentSchema = new Schema(
  {
    ...tenantFields,
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    provider: { type: String, enum: ["paystack", "flutterwave"], required: true },
    reference: { type: String, required: true, unique: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "NGN" },
    status: { type: String, enum: ["pending", "paid", "failed", "expired", "refunded"], default: "pending" },
    authorizationUrl: String,
    rawWebhookEventIds: [{ type: String }],
    paidAt: Date,
  },
  timestamps
);

export const Payment = model("Payment", paymentSchema);
