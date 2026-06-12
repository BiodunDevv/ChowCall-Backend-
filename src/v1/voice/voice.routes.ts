import { Router } from "express";
import { env } from "../../config/env.js";
import { AppError } from "../../shared/errors/app-error.js";
import { Tenant } from "../tenants/tenant.model.js";
import { handleOrderingMessage, startOrderingSession } from "../ai-ordering/ai-ordering-engine.js";
import { VoiceSession } from "../ai-ordering/voice-session.model.js";

export const voiceRouter = Router();

type AzureSpeechTokenResponse = {
  token: string;
  region: string;
  endpoint: string;
  expiresInSeconds: number;
  voice: TenantVoiceSettings;
};

type TenantVoiceSettings = {
  enabled: boolean;
  greeting: string;
  speechVoiceName: string;
  speechVoiceStyle: string;
  speechLanguage: string;
};

type VoiceOption = {
  name: string;
  displayName: string;
  locale: string;
  gender?: string;
};

const defaultSpeechVoice: TenantVoiceSettings = {
  enabled: true,
  greeting: "Welcome. What would you like to order today?",
  speechVoiceName: "en-NG-EzinneNeural",
  speechVoiceStyle: "friendly",
  speechLanguage: "en-NG",
};

const fallbackVoices: VoiceOption[] = [
  { name: "en-NG-EzinneNeural", displayName: "Ezinne", locale: "en-NG", gender: "Female" },
  { name: "en-NG-AbeoNeural", displayName: "Abeo", locale: "en-NG", gender: "Male" },
  { name: "en-GB-SoniaNeural", displayName: "Sonia", locale: "en-GB", gender: "Female" },
  { name: "en-GB-RyanNeural", displayName: "Ryan", locale: "en-GB", gender: "Male" },
  { name: "en-US-JennyNeural", displayName: "Jenny", locale: "en-US", gender: "Female" },
  { name: "en-US-GuyNeural", displayName: "Guy", locale: "en-US", gender: "Male" },
];

let cachedVoiceOptions: { expiresAt: number; voices: VoiceOption[]; source: "azure" | "fallback" } | null = null;

function twiml(content: string) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${content}</Response>`;
}

function say(text: string) {
  return `<Say voice="alice">${escapeXml(text)}</Say>`;
}

function gather(prompt: string, sessionId?: string) {
  const action = `/v1/voice/gather${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ""}`;
  return `<Gather input="speech dtmf" timeout="5" speechTimeout="auto" action="${action}" method="POST">${say(prompt)}</Gather>${say("I did not hear anything. Please call back when you are ready to order.")}`;
}

function escapeXml(text: string) {
  return text.replace(/[<>&'"]/g, (char) => {
    const map: Record<string, string> = { "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", "\"": "&quot;" };
    return map[char] ?? char;
  });
}

function requireAzureSpeechConfig() {
  if (!env.AZURE_SPEECH_KEY || !env.AZURE_SPEECH_REGION || !env.AZURE_SPEECH_ENDPOINT) {
    throw new AppError(
      503,
      "Voice ordering is temporarily unavailable.",
      "AZURE_SPEECH_NOT_CONFIGURED"
    );
  }
}

function normalizeTenantVoice(tenant?: {
  name?: string;
  voice?: Partial<TenantVoiceSettings> | null;
} | null): TenantVoiceSettings {
  const greeting =
    tenant?.voice?.greeting?.trim() ||
    (tenant?.name ? `Welcome to ${tenant.name}. What would you like to order today?` : defaultSpeechVoice.greeting);

  return {
    enabled: tenant?.voice?.enabled !== false,
    greeting,
    speechVoiceName: tenant?.voice?.speechVoiceName || defaultSpeechVoice.speechVoiceName,
    speechVoiceStyle: tenant?.voice?.speechVoiceStyle || defaultSpeechVoice.speechVoiceStyle,
    speechLanguage: tenant?.voice?.speechLanguage || defaultSpeechVoice.speechLanguage,
  };
}

async function fetchVoiceOptions() {
  if (cachedVoiceOptions && cachedVoiceOptions.expiresAt > Date.now()) return cachedVoiceOptions;
  if (!env.AZURE_SPEECH_KEY || !env.AZURE_SPEECH_REGION) {
    cachedVoiceOptions = { expiresAt: Date.now() + 10 * 60_000, voices: fallbackVoices, source: "fallback" };
    return cachedVoiceOptions;
  }

  try {
    const response = await fetch(
      `https://${env.AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/voices/list`,
      { headers: { "Ocp-Apim-Subscription-Key": env.AZURE_SPEECH_KEY } }
    );
    if (!response.ok) throw new Error(`Azure voice list failed: ${response.status}`);
    const voices = (await response.json()) as Array<{
      ShortName?: string;
      LocalName?: string;
      DisplayName?: string;
      Locale?: string;
      Gender?: string;
      VoiceType?: string;
    }>;
    const allowedNames = new Set(fallbackVoices.map((voice) => voice.name));
    const filtered = voices
      .filter((voice) => voice.ShortName && allowedNames.has(voice.ShortName) && voice.VoiceType === "Neural")
      .map((voice) => ({
        name: voice.ShortName!,
        displayName: voice.LocalName || voice.DisplayName || voice.ShortName!,
        locale: voice.Locale || "en-NG",
        gender: voice.Gender,
      }));

    cachedVoiceOptions = {
      expiresAt: Date.now() + 60 * 60_000,
      voices: filtered.length > 0 ? filtered : fallbackVoices,
      source: filtered.length > 0 ? "azure" : "fallback",
    };
    return cachedVoiceOptions;
  } catch {
    cachedVoiceOptions = { expiresAt: Date.now() + 10 * 60_000, voices: fallbackVoices, source: "fallback" };
    return cachedVoiceOptions;
  }
}

async function createAzureSpeechToken(tenantSlug?: string): Promise<AzureSpeechTokenResponse> {
  requireAzureSpeechConfig();
  const tenant = tenantSlug
    ? await Tenant.findOne({ slug: tenantSlug }).select("name voice").lean<{
        name: string;
        voice?: Partial<TenantVoiceSettings>;
      }>()
    : null;

  const endpoint = new URL("/sts/v1.0/issueToken", env.AZURE_SPEECH_ENDPOINT);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": env.AZURE_SPEECH_KEY,
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": "0",
    },
  });

  const token = await response.text();
  if (!response.ok || !token) {
    throw new AppError(
      502,
      "Voice ordering is temporarily unavailable.",
      "AZURE_SPEECH_TOKEN_FAILED",
      { status: response.status }
    );
  }

  return {
    token,
    region: env.AZURE_SPEECH_REGION,
    endpoint: env.AZURE_SPEECH_ENDPOINT,
    expiresInSeconds: 540,
    voice: normalizeTenantVoice(tenant),
  };
}

voiceRouter.post("/web-token", async (req, res, next) => {
  try {
    const data = await createAzureSpeechToken(typeof req.body?.tenantSlug === "string" ? req.body.tenantSlug : undefined);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

voiceRouter.get("/voices", async (_req, res, next) => {
  try {
    const data = await fetchVoiceOptions();
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

async function resolveTenantByCalledNumber(calledNumber?: string) {
  if (!calledNumber) return Tenant.findOne({ slug: "mamaskitchen" }).lean();
  return Tenant.findOne({
    $or: [
      { "voice.routingNumber": calledNumber },
      { "voice.dedicatedNumber": calledNumber },
      { phone: calledNumber },
    ],
  }).lean();
}

voiceRouter.post("/incoming", async (req, res, next) => {
  try {
    const callSid = String(req.body?.CallSid ?? "");
    const from = String(req.body?.From ?? "");
    const to = String(req.body?.To ?? "");
    const tenant = await resolveTenantByCalledNumber(to);
    if (!tenant) throw new AppError(404, "No ChowCall restaurant is mapped to this number.", "VOICE_TENANT_NOT_FOUND");

    const chat = await startOrderingSession(tenant.slug);
    await VoiceSession.findOneAndUpdate(
      { callSid },
      {
        tenantId: tenant._id,
        tenantSlug: tenant.slug,
        callSid,
        from,
        to,
        status: "active",
        chatSessionId: chat.session?.id,
      },
      { upsert: true, new: true }
    );

    res.type("text/xml").send(twiml(gather(chat.assistantMessage, chat.session?.id)));
  } catch (error) {
    next(error);
  }
});

voiceRouter.post("/gather", async (req, res, next) => {
  try {
    const callSid = String(req.body?.CallSid ?? "");
    const transcript = String(req.body?.SpeechResult ?? req.body?.Digits ?? "").trim();
    const voiceSession = await VoiceSession.findOne({ callSid });
    if (!voiceSession) throw new AppError(404, "Voice session not found.", "VOICE_SESSION_NOT_FOUND");

    if (!transcript) {
      res.type("text/xml").send(twiml(gather("Please tell me what you would like to order.", String(voiceSession.chatSessionId))));
      return;
    }

    const result = await handleOrderingMessage({
      tenantSlug: voiceSession.tenantSlug,
      sessionId: String(req.query.sessionId ?? voiceSession.chatSessionId ?? ""),
      message: transcript,
    });

    if (result.session?.id) {
      voiceSession.set("chatSessionId", result.session.id);
    }
    voiceSession.turns.push({
      callerText: transcript,
      assistantText: result.assistantMessage,
      confidence: Number(req.body?.Confidence ?? 0),
    });
    await voiceSession.save();

    const followUp = result.paymentReady
      ? `${result.assistantMessage} A payment link can be sent by SMS. Please stay on the line for confirmation.`
      : result.assistantMessage;
    res.type("text/xml").send(twiml(gather(followUp, result.session?.id)));
  } catch (error) {
    next(error);
  }
});

voiceRouter.post("/status", async (req, res) => {
  const callSid = String(req.body?.CallSid ?? "");
  const callStatus = String(req.body?.CallStatus ?? "");
  if (callSid && ["completed", "failed", "busy", "no-answer"].includes(callStatus)) {
    await VoiceSession.findOneAndUpdate({ callSid }, { status: callStatus === "completed" ? "completed" : "failed" });
  }
  res.json({ received: true });
});

voiceRouter.post("/recording", async (req, res) => {
  const callSid = String(req.body?.CallSid ?? "");
  const recordingUrl = String(req.body?.RecordingUrl ?? "");
  if (callSid && recordingUrl) {
    await VoiceSession.findOneAndUpdate(
      { callSid },
      { $push: { turns: { callerText: "[recording]", assistantText: recordingUrl, confidence: 0 } } }
    );
  }
  res.json({ received: true });
});

voiceRouter.get("/media-stream", (_req, res) => {
  res.json({
    data: {
      mode: env.VOICE_MODE,
      mediaStreamUrl: env.TWILIO_MEDIA_STREAM_URL,
      status: env.VOICE_MODE === "media_stream" ? "configured" : "gather_fallback",
    },
  });
});
