import { model, Schema } from "mongoose";
import { tenantFields, timestamps } from "../shared/base-model.js";

const optionSchema = new Schema({ name: String, price: Number }, { _id: false });
const variantSchema = new Schema({ name: String, options: [optionSchema] }, { _id: false });
const addonSchema = new Schema({ name: String, price: Number }, { _id: false });

const menuItemSchema = new Schema(
  {
    ...tenantFields,
    name: { type: String, required: true, index: true },
    category: { type: String, required: true, index: true },
    description: String,
    basePrice: { type: Number, required: true },
    available: { type: Boolean, default: true, index: true },
    variants: [variantSchema],
    addons: [addonSchema],
    prepNoteAllowed: { type: Boolean, default: true },
    photos: [{ url: String, alt: String }],
    autoResetAvailability: { type: Boolean, default: true },
  },
  timestamps
);

export const MenuItem = model("MenuItem", menuItemSchema);
