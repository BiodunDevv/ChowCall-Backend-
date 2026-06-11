import { Schema, model } from "mongoose";

const usageEventSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    type: {
      type: String,
      enum: ["call_minute", "sms", "order", "payment", "ai_token"],
      required: true,
      index: true,
    },
    quantity: { type: Number, required: true, default: 1 },
    metadata: { type: Schema.Types.Mixed },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const UsageEvent = model("UsageEvent", usageEventSchema);
