import { model, Schema } from "mongoose";
import { orderStatuses } from "../../shared/constants/order-status.js";
import { tenantFields, timestamps } from "../shared/base-model.js";

const orderItemSchema = new Schema(
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

const orderSchema = new Schema(
  {
    ...tenantFields,
    orderNumber: { type: String, index: true },
    source: { type: String, enum: ["voice", "web", "dashboard", "whatsapp"], default: "voice" },
    status: { type: String, enum: orderStatuses, default: "DRAFT", index: true },
    customer: {
      name: String,
      phone: String,
      address: String,
      landmark: String,
      mapLink: String,
      lat: Number,
      lng: Number,
    },
    fulfilmentType: { type: String, enum: ["pickup", "delivery"], required: true },
    items: [orderItemSchema],
    pricing: {
      itemSubtotal: { type: Number, default: 0 },
      deliveryFee: { type: Number, default: 0 },
      serviceFee: { type: Number, default: 0 },
      discount: { type: Number, default: 0 },
      totalPayable: { type: Number, default: 0 },
      distanceKm: Number,
      durationMinutes: Number,
    },
    payment: {
      provider: String,
      reference: String,
      authorizationUrl: String,
      paidAt: Date,
      expiresAt: Date,
    },
    kitchenTicketSentAt: Date,
    escalationId: { type: Schema.Types.ObjectId, ref: "Escalation" },
  },
  timestamps
);

export const Order = model("Order", orderSchema);
