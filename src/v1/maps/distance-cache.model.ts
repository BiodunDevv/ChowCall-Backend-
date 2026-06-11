import { model, Schema } from "mongoose";
import { tenantFields, timestamps } from "../shared/base-model.js";

const distanceCacheSchema = new Schema(
  {
    ...tenantFields,
    addressHash: { type: String, required: true, index: true },
    normalizedAddress: { type: String, required: true },
    distanceKm: Number,
    durationMinutes: Number,
    customerLat: Number,
    customerLng: Number,
    confidence: Number,
    provider: String,
  },
  timestamps
);

distanceCacheSchema.index({ tenantId: 1, addressHash: 1 }, { unique: true });

export const DistanceCache = model("DistanceCache", distanceCacheSchema);
