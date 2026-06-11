import { Schema } from "mongoose";

export const tenantFields = {
  tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: "User" },
};

export const timestamps = { timestamps: true };
