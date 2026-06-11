import { Schema, model } from "mongoose";

const escalationSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", index: true },
    callSessionId: { type: String, index: true },
    reason: { type: String, required: true },
    priority: { type: String, enum: ["low", "normal", "high", "urgent"], default: "normal" },
    prompt: String,
    status: { type: String, enum: ["pending", "resolved", "expired"], default: "pending", index: true },
    timeoutSeconds: { type: Number, default: 120 },
    expiresAt: Date,
    resolution: String,
    decision: { type: String, enum: ["approved", "rejected", "needs_followup"] },
    resolvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    resolvedAt: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const Escalation = model("Escalation", escalationSchema);
