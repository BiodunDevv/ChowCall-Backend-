import { randomUUID, createHash } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import { Router } from "express";
import { AppError } from "../../shared/errors/app-error.js";
import { azureVoiceLiveService, type VoiceLiveServerEvent } from "../../providers/voice/azure-voice-live.service.js";
import { Tenant } from "../tenants/tenant.model.js";
import { MenuItem } from "../menu/menu-item.model.js";
import { ChatSession } from "../ai-ordering/chat-session.model.js";
import { VoiceSession } from "../ai-ordering/voice-session.model.js";
import { handleOrderingMessage, startOrderingSession } from "../ai-ordering/ai-ordering-engine.js";

export const liveVoiceRouter = Router({ mergeParams: true });

function normalizeTenantVoice(tenant: { name: string; voice?: { greeting?: string | null; enabled?: boolean | null } | null }) {
  return {
    enabled: tenant.voice?.enabled !== false,
    greeting: tenant.voice?.greeting?.trim() || `Welcome to ${tenant.name}. What would you like to order today?`,
  };
}

async function resolveTenant(tenantSlug: string, requireActive = true) {
  const tenant = await Tenant.findOne({ slug: tenantSlug }).select("name slug subscriptionStatus voice").lean<{
    _id: unknown;
    name: string;
    slug: string;
    subscriptionStatus?: string | null;
    voice?: { enabled?: boolean | null; greeting?: string | null } | null;
  }>();
  if (!tenant) throw new AppError(404, "Restaurant not found.", "TENANT_NOT_FOUND");
  if (requireActive && tenant.subscriptionStatus !== "active") {
    throw new AppError(
      403,
      "AI ordering is available after this restaurant activates ChowCall.",
      "AI_ORDERING_REQUIRES_ACTIVE_SUBSCRIPTION"
    );
  }
  if (tenant.voice?.enabled === false) {
    throw new AppError(404, "Live voice ordering is not active for this restaurant.", "AI_ORDERING_DISABLED");
  }
  return tenant;
}

function sessionPayload(session: {
  _id?: unknown;
  liveVoiceSessionId?: string | null;
  tenantSlug?: string | null;
  status?: string | null;
  chatSessionId?: unknown;
  paymentStatus?: string | null;
  agentName?: string | null;
  agentVersion?: string | null;
}) {
  return {
    sessionId: session.liveVoiceSessionId,
    tenantSlug: session.tenantSlug,
    orderingSessionId: session.chatSessionId ? String(session.chatSessionId) : null,
    agentName: session.agentName,
    agentVersion: session.agentVersion,
    connectionMode: "backend_proxy",
    status: session.status,
    paymentStatus: session.paymentStatus,
  };
}

function orderSnapshot(session: {
  _id: unknown;
  status?: string;
  items?: unknown;
  fulfilmentType?: unknown;
  customer?: unknown;
  pricing?: unknown;
  needs?: unknown;
  orderId?: unknown;
} | null) {
  if (!session) return null;
  return {
    id: String(session._id),
    status: session.status,
    items: session.items ?? [],
    fulfilmentType: session.fulfilmentType ?? null,
    customer: session.customer ?? {},
    pricing: session.pricing ?? {},
    needs: session.needs ?? [],
    orderId: session.orderId ? String(session.orderId) : null,
  };
}

async function getLiveSession(tenantSlug: string, sessionId: string) {
  const tenant = await resolveTenant(tenantSlug);
  const voiceSession = await VoiceSession.findOne({
    liveVoiceSessionId: sessionId,
    tenantId: tenant._id,
    tenantSlug: tenant.slug,
  });
  if (!voiceSession) throw new AppError(404, "Live voice session not found.", "LIVE_VOICE_SESSION_NOT_FOUND");
  return { tenant, voiceSession };
}

liveVoiceRouter.post("/session", async (req, res, next) => {
  try {
    const tenantSlug = String((req.params as { tenantSlug?: string }).tenantSlug ?? "");
    const tenant = await resolveTenant(tenantSlug);
    const voice = normalizeTenantVoice(tenant);
    const ordering = await startOrderingSession(tenant.slug);
    const metadata = azureVoiceLiveService.sessionMetadata();
    const liveVoiceSessionId = `live_${randomUUID().replace(/-/g, "")}`;
    const voiceSession = await VoiceSession.create({
      tenantId: tenant._id,
      tenantSlug: tenant.slug,
      liveVoiceSessionId,
      callSid: liveVoiceSessionId,
      channel: "web_voice",
      status: "created",
      chatSessionId: ordering.session?.id,
      agentName: metadata.agentName,
      agentVersion: metadata.agentVersion,
      paymentStatus: "not_ready",
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      turns: [{ assistantText: voice.greeting, confidence: 1 }],
    });

    res.status(201).json({
      data: {
        ...sessionPayload(voiceSession),
        tenantId: String(tenant._id),
        status: "created",
        foundryConfigured: azureVoiceLiveService.isConfigured(),
      },
    });
  } catch (error) {
    next(error);
  }
});

liveVoiceRouter.get("/session/:sessionId/order", async (req, res, next) => {
  try {
    const params = req.params as { tenantSlug?: string; sessionId?: string };
    const { voiceSession } = await getLiveSession(String(params.tenantSlug ?? ""), String(params.sessionId ?? ""));
    const chat = voiceSession.chatSessionId ? await ChatSession.findById(voiceSession.chatSessionId).lean() : null;
    res.json({ data: { session: sessionPayload(voiceSession), order: orderSnapshot(chat) } });
  } catch (error) {
    next(error);
  }
});

liveVoiceRouter.post("/tool", async (req, res, next) => {
  try {
    const tenantSlug = String((req.params as { tenantSlug?: string }).tenantSlug ?? "");
    const sessionId = String(req.body?.sessionId ?? "");
    const toolName = String(req.body?.toolName ?? req.body?.name ?? "");
    if (!sessionId) throw new AppError(400, "Session id is required.", "LIVE_VOICE_SESSION_REQUIRED");
    const { tenant, voiceSession } = await getLiveSession(tenantSlug, sessionId);

    if (toolName === "get_tenant_profile") {
      res.json({ data: { tenantId: String(tenant._id), name: tenant.name, slug: tenant.slug, channel: "web_voice" } });
      return;
    }

    if (toolName === "get_menu" || toolName === "search_menu_items") {
      const query = String(req.body?.args?.query ?? "").toLowerCase().trim();
      const items = await MenuItem.find({ tenantId: tenant._id }).sort({ category: 1, name: 1 }).lean();
      res.json({
        data: {
          items: query
            ? items.filter((item) => `${item.name} ${item.category ?? ""}`.toLowerCase().includes(query))
            : items,
          channel: "web_voice",
        },
      });
      return;
    }

    if (toolName === "process_transcript" || toolName === "add_item_to_order") {
      const transcript = String(req.body?.args?.transcript ?? req.body?.args?.message ?? "");
      if (!transcript.trim()) throw new AppError(400, "Transcript is required.", "LIVE_VOICE_TRANSCRIPT_REQUIRED");
      const result = await handleOrderingMessage({
        tenantSlug,
        sessionId: voiceSession.chatSessionId ? String(voiceSession.chatSessionId) : undefined,
        message: transcript,
      });
      if (result.session?.id) voiceSession.set("chatSessionId", result.session.id);
      voiceSession.turns.push({ callerText: transcript, assistantText: result.assistantMessage, confidence: 1 });
      voiceSession.status = result.paymentReady ? "payment_pending" : "active";
      voiceSession.paymentStatus = result.paymentReady ? "ready" : "not_ready";
      await voiceSession.save();
      res.json({ data: { ...result, channel: "web_voice" } });
      return;
    }

    res.json({
      data: {
        handled: false,
        toolName,
        message: "Tool is registered but not implemented for this live voice session yet.",
        channel: "web_voice",
      },
    });
  } catch (error) {
    next(error);
  }
});

function websocketAccept(key: string) {
  return createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");
}

function encodeFrame(payload: string) {
  const data = Buffer.from(payload);
  const header =
    data.length < 126
      ? Buffer.from([0x81, data.length])
      : data.length < 65536
        ? Buffer.from([0x81, 126, (data.length >> 8) & 255, data.length & 255])
        : Buffer.from([0x81, 127, 0, 0, 0, 0, (data.length >> 24) & 255, (data.length >> 16) & 255, (data.length >> 8) & 255, data.length & 255]);
  return Buffer.concat([header, data]);
}

function decodeTextFrames(buffer: Buffer) {
  const messages: string[] = [];
  let offset = 0;
  while (offset + 2 <= buffer.length) {
    const opcode = buffer[offset] & 0x0f;
    const masked = (buffer[offset + 1] & 0x80) === 0x80;
    let length = buffer[offset + 1] & 0x7f;
    offset += 2;
    if (length === 126) {
      if (offset + 2 > buffer.length) break;
      length = buffer.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      if (offset + 8 > buffer.length) break;
      length = Number(buffer.readBigUInt64BE(offset));
      offset += 8;
    }
    const mask = masked ? buffer.subarray(offset, offset + 4) : null;
    if (masked) offset += 4;
    if (offset + length > buffer.length) break;
    const data = buffer.subarray(offset, offset + length);
    offset += length;
    if (opcode === 0x8) break;
    if (opcode !== 0x1 || !mask) continue;
    const unmasked = Buffer.alloc(length);
    for (let index = 0; index < length; index += 1) {
      unmasked[index] = data[index] ^ mask[index % 4];
    }
    messages.push(unmasked.toString("utf8"));
  }
  return messages;
}

function send(socket: Socket, event: VoiceLiveServerEvent) {
  if (!socket.destroyed) socket.write(encodeFrame(JSON.stringify(event)));
}

export async function handleLiveVoiceUpgrade(req: IncomingMessage, socket: Socket) {
  const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
  const match = pathname.match(/^\/v1\/public-ordering\/([^/]+)\/live-voice\/stream\/([^/]+)$/);
  if (!match) return false;

  const key = req.headers["sec-websocket-key"];
  if (!key || Array.isArray(key)) {
    socket.destroy();
    return true;
  }

  socket.write(
    [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${websocketAccept(key)}`,
      "",
      "",
    ].join("\r\n")
  );

  const tenantSlug = decodeURIComponent(match[1]);
  const sessionId = decodeURIComponent(match[2]);

  try {
    const { tenant, voiceSession } = await getLiveSession(tenantSlug, sessionId);
    const voice = normalizeTenantVoice(tenant);
    voiceSession.status = "active";
    await voiceSession.save();

    if (!azureVoiceLiveService.isConfigured()) {
      send(socket, azureVoiceLiveService.unavailableEvent());
      return true;
    }

    for (const event of azureVoiceLiveService.initialEvents({
      sessionId,
      tenantSlug,
      tenantName: tenant.name,
      greeting: voice.greeting,
    })) {
      send(socket, event);
    }

    socket.on("data", (chunk) => {
      for (const raw of decodeTextFrames(chunk)) {
        try {
          const event = JSON.parse(raw) as { type?: string };
          if (event.type === "audio.mute") send(socket, { type: "caption.assistant", text: "Muted. I will wait until you unmute." });
          if (event.type === "audio.unmute") send(socket, { type: "caption.assistant", text: "I can hear you again." });
          if (event.type === "session.end") {
            send(socket, { type: "session.ended" });
            socket.end();
          }
        } catch {
          send(socket, { type: "error", code: "LIVE_VOICE_EVENT_INVALID", message: "Could not read the live voice event." });
        }
      }
    });
  } catch {
    send(socket, { type: "error", code: "LIVE_VOICE_SESSION_FAILED", message: "Could not start this live voice session." });
  }

  return true;
}
