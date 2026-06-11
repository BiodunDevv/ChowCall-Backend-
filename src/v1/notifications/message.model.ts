import { Schema, model } from "mongoose";

const messageSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", index: true },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", index: true },
    channel: { type: String, enum: ["sms", "whatsapp", "email"], required: true },
    provider: { type: String, required: true, index: true },
    recipient: { type: String, required: true },
    normalizedRecipient: { type: String, index: true },
    messageType: { type: String, required: true, default: "general" },
    body: { type: String, required: true },
    status: { type: String, enum: ["queued", "sent", "failed"], required: true },
    providerMessageId: { type: String, index: true },
    rawResponse: { type: Schema.Types.Mixed },
    error: { type: Schema.Types.Mixed },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const Message = model("Message", messageSchema);
