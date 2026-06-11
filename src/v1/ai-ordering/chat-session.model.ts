import { model, Schema } from "mongoose";
import { tenantFields, timestamps } from "../shared/base-model.js";

const draftItemSchema = new Schema(
  {
    menuItemId: { type: Schema.Types.ObjectId, ref: "MenuItem" },
    name: String,
    quantity: Number,
    unitPrice: Number,
    variants: [{ name: String, option: String, price: Number }],
    addons: [{ name: String, price: Number, quantity: Number }],
    notes: String,
    lineTotal: Number,
  },
  { _id: false }
);

const chatMessageSchema = new Schema(
  {
    role: { type: String, enum: ["assistant", "user", "system"], required: true },
    content: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const chatSessionSchema = new Schema(
  {
    ...tenantFields,
    tenantSlug: { type: String, required: true, index: true },
    channel: { type: String, enum: ["chat", "voice"], default: "chat", index: true },
    status: {
      type: String,
      enum: ["active", "ready_for_payment", "converted", "abandoned", "expired"],
      default: "active",
      index: true,
    },
    customer: {
      name: String,
      phone: String,
      email: String,
      address: String,
      landmark: String,
      mapLink: String,
      lat: Number,
      lng: Number,
    },
    fulfilmentType: { type: String, enum: ["pickup", "delivery"], default: null },
    items: [draftItemSchema],
    pricing: {
      itemSubtotal: { type: Number, default: 0 },
      deliveryFee: { type: Number, default: 0 },
      serviceFee: { type: Number, default: 0 },
      discount: { type: Number, default: 0 },
      totalPayable: { type: Number, default: 0 },
      distanceKm: Number,
      durationMinutes: Number,
    },
    needs: [{ type: String }],
    lastAssistantMessage: String,
    orderId: { type: Schema.Types.ObjectId, ref: "Order" },
    expiresAt: { type: Date, index: true },
    messages: [chatMessageSchema],
  },
  timestamps
);

export const ChatSession = model("ChatSession", chatSessionSchema);
