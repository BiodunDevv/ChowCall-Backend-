import { model, Schema } from "mongoose";
import { tenantFields, timestamps } from "../shared/base-model.js";

const voiceTurnSchema = new Schema(
  {
    callerText: String,
    assistantText: String,
    confidence: Number,
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const voiceSessionSchema = new Schema(
  {
    ...tenantFields,
    tenantSlug: { type: String, required: true, index: true },
    callSid: { type: String, required: true, unique: true, index: true },
    from: String,
    to: String,
    status: { type: String, enum: ["active", "completed", "failed"], default: "active" },
    chatSessionId: { type: Schema.Types.ObjectId, ref: "ChatSession" },
    turns: [voiceTurnSchema],
  },
  timestamps
);

export const VoiceSession = model("VoiceSession", voiceSessionSchema);
