import { model, Schema } from "mongoose";

const planSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    priceMonthly: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, enum: ["NGN", "USD", "EUR", "GBP"], default: "NGN" },
    includedMinutes: { type: Number, required: true, min: 0 },
    overagePerMinute: { type: Number, required: true, min: 0 },
    features: [{ type: String, required: true, trim: true }],
    badge: { type: String, trim: true, default: null },
    sortOrder: { type: Number, required: true, default: 0, index: true },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

export const Plan = model("Plan", planSchema);
