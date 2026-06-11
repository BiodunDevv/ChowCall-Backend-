import { model, Schema } from "mongoose";
import { tenantFields, timestamps } from "../shared/base-model.js";

const kitchenTicketSchema = new Schema(
  {
    ...tenantFields,
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    channel: { type: String, enum: ["sms", "whatsapp", "dashboard"], default: "dashboard" },
    recipient: String,
    body: { type: String, required: true },
    status: { type: String, enum: ["pending", "sent", "failed"], default: "pending", index: true },
    providerMessageId: String,
    attempts: { type: Number, default: 0 },
    lastError: { type: Schema.Types.Mixed },
    sentAt: Date,
  },
  timestamps
);

export const KitchenTicket = model("KitchenTicket", kitchenTicketSchema);
