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
    liveVoiceSessionId: { type: String, unique: true, sparse: true, index: true },
    callSid: { type: String, unique: true, sparse: true, index: true },
    channel: { type: String, enum: ["web_voice", "phone"], default: "web_voice", index: true },
    provider: { type: String, default: "aws_nova_sonic" },
    modelId: String,
    agentName: String,
    agentVersion: String,
    from: String,
    to: String,
    status: {
      type: String,
      enum: ["created", "active", "muted", "payment_pending", "paid", "completed", "failed"],
      default: "created",
      index: true,
    },
    chatSessionId: { type: Schema.Types.ObjectId, ref: "ChatSession" },
    paymentStatus: { type: String, default: "not_ready" },
    lastEvent: String,
    lastError: String,
    expiresAt: { type: Date, index: true },
    turns: [voiceTurnSchema],
  },
  timestamps
);

export const VoiceSession = model("VoiceSession", voiceSessionSchema);
