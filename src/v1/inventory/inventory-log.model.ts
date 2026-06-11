import { Schema, model } from "mongoose";

const inventoryLogSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    menuItemId: { type: Schema.Types.ObjectId, ref: "MenuItem", required: true, index: true },
    action: {
      type: String,
      enum: ["marked_sold_out", "marked_available", "reset_available"],
      required: true,
    },
    reason: String,
    resetAt: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const InventoryLog = model("InventoryLog", inventoryLogSchema);
