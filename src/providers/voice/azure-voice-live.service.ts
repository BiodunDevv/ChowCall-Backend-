import { env } from "../../config/env.js";
import { AppError } from "../../shared/errors/app-error.js";
import { AzureKeyCredential } from "@azure/core-auth";
import { KnownClientEventType, VoiceLiveClient } from "@azure/ai-voicelive";

export type VoiceLiveClientEvent =
  | { type: "start_session" }
  | { type: "audio_chunk"; data?: string }
  | { type: "stop_session" }
  | { type: "interrupt" }
  | { type: "session.start" }
  | { type: "audio.chunk"; audio?: string }
  | { type: "audio.mute" }
  | { type: "audio.unmute" }
  | { type: "session.end" };

export type VoiceLiveServerEvent =
  | { type: "session_started"; session_id: string; config?: Record<string, unknown> }
  | { type: "session.ready"; sessionId: string; agentName: string; agentVersion: string }
  | { type: "transcript"; role: "assistant" | "user"; text: string; isFinal: boolean }
  | { type: "audio_data"; data: string; format: "pcm16"; sampleRate: number; channels: number }
  | { type: "caption.user"; text: string }
  | { type: "caption.assistant"; text: string }
  | { type: "assistant.audio"; audio: string; mimeType: string; sampleRate: number; channels: number }
  | { type: "status"; state: "listening" | "thinking" | "speaking" }
  | { type: "stop_playback" }
  | { type: "order.updated"; order: unknown }
  | { type: "payment.ready"; orderId?: string; authorizationUrl?: string }
  | { type: "payment.pending"; orderId?: string }
  | { type: "payment.paid"; orderId?: string }
  | { type: "error"; message: string; code: string }
  | { type: "session_stopped" }
  | { type: "session.ended" };

export type VoiceLiveSessionConfig = {
  sessionId: string;
  tenantSlug: string;
  tenantName: string;
  greeting: string;
};

type VoiceLiveBridgeConfig = VoiceLiveSessionConfig & {
  instructions?: string;
  onUserTranscript?: (text: string) => Promise<string | void> | string | void;
  send: (event: VoiceLiveServerEvent) => void;
};

type AzureSessionLike = {
  updateSession: (session: Record<string, unknown>) => Promise<void>;
  sendAudio: (audioData: Uint8Array) => Promise<void>;
  sendEvent: (event: Record<string, unknown>) => Promise<void>;
  dispose: () => Promise<void>;
  isConnected?: boolean;
};

export class AzureVoiceLiveBridge {
  private session: AzureSessionLike | null = null;
  private assistantTranscript = "";
  private ready = false;
  private stopped = false;
  private azureFailed = false;
  private greetingSent = false;
  private queuedAudio: string[] = [];

  constructor(private readonly config: VoiceLiveBridgeConfig) {}

  async start() {
    azureVoiceLiveService.assertConfigured();
    this.stopped = false;
    this.azureFailed = false;

    const endpoint =
      env.AZURE_VOICELIVE_ENDPOINT ||
      env.AZURE_SPEECH_ENDPOINT ||
      env.AZURE_AI_FOUNDRY_TARGET_URI ||
      env.AZURE_EXISTING_AIPROJECT_ENDPOINT ||
      env.AZURE_AI_ENDPOINT;
    const apiKey =
      env.AZURE_VOICELIVE_API_KEY ||
      env.AZURE_SPEECH_KEY ||
      env.AZURE_AI_FOUNDRY_API_KEY;
    this.emit({ type: "caption.assistant", text: this.config.greeting });
    this.emit({
      type: "transcript",
      role: "assistant",
      text: this.config.greeting,
      isFinal: true,
    });
    const client = new VoiceLiveClient(
      endpoint,
      new AzureKeyCredential(apiKey),
      { apiVersion: "2026-01-01-preview" },
    );

    const handlers = this.buildHandlers();
    this.session = (await client.startSession(
      {
        agent: {
          agentName: env.AZURE_EXISTING_AGENT_NAME,
          projectName: env.AZURE_PROJECT_NAME,
          agentVersion: env.AZURE_EXISTING_AGENT_VERSION,
        },
      },
      { sessionHandlers: handlers },
    )) as unknown as AzureSessionLike;

    await this.session.updateSession({
      modalities: ["text", "audio"],
      inputAudioFormat: "pcm16",
      outputAudioFormat: "pcm16",
      inputAudioSamplingRate: 24000,
      voice: { type: "azure-standard", name: "en-NG-EzinneNeural" },
      turnDetection: { type: "azure_semantic_vad" },
      inputAudioEchoCancellation: { type: "server_echo_cancellation" },
      inputAudioNoiseReduction: { type: "azure_deep_noise_suppression" },
    });
  }

  async sendAudio(audioBase64?: string) {
    if (!this.session || !audioBase64 || this.stopped || this.azureFailed) return;
    if (!this.ready) {
      this.queuedAudio.push(audioBase64);
      if (this.queuedAudio.length > 20) this.queuedAudio.shift();
      return;
    }
    if (this.session.isConnected === false) {
      await this.failAzure(
        "audio_send",
        new Error("Azure Voice Live socket is not connected."),
        "Azure Voice Live disconnected. Please start a new voice order.",
      );
      return;
    }
    try {
      await this.session.sendAudio(new Uint8Array(Buffer.from(audioBase64, "base64")));
    } catch (error) {
      await this.failAzure(
        "audio_send",
        error,
        "Azure Voice Live disconnected while receiving audio. Please start a new voice order.",
      );
    }
  }

  async stop() {
    this.stopped = true;
    this.ready = false;
    this.queuedAudio = [];
    if (!this.session) return;
    const session = this.session;
    this.session = null;
    await session.dispose().catch(() => undefined);
  }

  private async speakText(text: string) {
    if (!this.session || !text.trim() || this.stopped || this.azureFailed) return;
    if (this.session.isConnected === false) {
      await this.failAzure(
        "speak_text",
        new Error("Azure Voice Live socket is not connected."),
        "Azure Voice Live disconnected before it could speak.",
      );
      return;
    }
    try {
      await this.session.sendEvent({
        type: KnownClientEventType.ResponseCreate,
        eventId: `evt_chowcall_${Date.now()}`,
        response: {
          preGeneratedAssistantMessage: {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text }],
          },
        },
      });
    } catch (error) {
      await this.failAzure(
        "speak_text",
        error,
        "Azure Voice Live could not speak the response. Please start a new voice order.",
      );
    }
  }

  private emit(event: VoiceLiveServerEvent) {
    if (!this.stopped) this.config.send(event);
  }

  private async markReady(serviceSessionId?: string) {
    if (this.ready || this.stopped || this.azureFailed) return;
    this.ready = true;
    this.emit({
      type: "session_started",
      session_id: serviceSessionId || this.config.sessionId,
      config: {
        mode: "agent",
        voice: "en-NG-EzinneNeural",
        agentName: env.AZURE_EXISTING_AGENT_NAME,
        agentVersion: env.AZURE_EXISTING_AGENT_VERSION,
      },
    });
    this.emit({
      type: "session.ready",
      sessionId: this.config.sessionId,
      agentName: env.AZURE_EXISTING_AGENT_NAME,
      agentVersion: env.AZURE_EXISTING_AGENT_VERSION,
    });
    this.emit({ type: "status", state: "listening" });
    if (!this.greetingSent) {
      this.greetingSent = true;
      await this.speakText(this.config.greeting).catch(() => undefined);
    }
    const queued = this.queuedAudio.splice(0);
    for (const audio of queued) {
      await this.sendAudio(audio).catch(() => undefined);
    }
  }

  private async failAzure(scope: string, error: unknown, clientMessage: string) {
    if (this.stopped || this.azureFailed) return;
    this.azureFailed = true;
    this.ready = false;
    this.queuedAudio = [];
    logVoiceLiveIssue(scope, error);
    this.emit({
      type: "error",
      code: "AZURE_VOICE_LIVE_ERROR",
      message: clientMessage,
    });
    const session = this.session;
    this.session = null;
    await session?.dispose().catch(() => undefined);
  }

  private buildHandlers() {
    return {
      onConnected: async () => {
        // Azure is connected, but audio should wait until session.updated confirms config.
      },
      onDisconnected: async (args: unknown) => {
        await this.failAzure(
          "disconnected",
          args,
          "Azure Voice Live disconnected. Please start a new voice order.",
        );
      },
      onError: async (args: unknown) => {
        await this.failAzure(
          "connection_error",
          args,
          errorMessage(args) || "Live voice ordering is temporarily unavailable.",
        );
      },
      onServerError: async (event: unknown) => {
        const message = errorMessage(event);
        if (message.toLowerCase().includes("no active response")) return;
        await this.failAzure(
          "server_error",
          event,
          message || "Live voice ordering is temporarily unavailable.",
        );
      },
      onResponseCreated: async () => {
        this.emit({ type: "status", state: "speaking" });
      },
      onResponseDone: async () => {
        if (this.assistantTranscript) {
          this.emit({ type: "caption.assistant", text: this.assistantTranscript });
          this.emit({
            type: "transcript",
            role: "assistant",
            text: this.assistantTranscript,
            isFinal: true,
          });
          this.assistantTranscript = "";
        }
        this.emit({ type: "status", state: "listening" });
      },
      onResponseAudioDelta: async (event: { delta?: Uint8Array | ArrayBuffer | string }) => {
        if (!event.delta) return;
        const audio =
          typeof event.delta === "string"
            ? event.delta
            : Buffer.from(
                event.delta instanceof ArrayBuffer
                  ? new Uint8Array(event.delta)
                  : event.delta,
              ).toString("base64");
        this.emit({
          type: "assistant.audio",
          audio,
          mimeType: "audio/pcm",
          sampleRate: 24000,
          channels: 1,
        });
        this.emit({
          type: "audio_data",
          data: audio,
          format: "pcm16",
          sampleRate: 24000,
          channels: 1,
        });
      },
      onResponseAudioTranscriptDelta: async (event: { delta?: string }) => {
        const delta = event.delta ?? "";
        if (!delta) return;
        this.assistantTranscript += delta;
        this.emit({ type: "caption.assistant", text: this.assistantTranscript });
        this.emit({
          type: "transcript",
          role: "assistant",
          text: this.assistantTranscript,
          isFinal: false,
        });
      },
      onInputAudioBufferSpeechStarted: async () => {
        this.emit({ type: "status", state: "listening" });
        this.emit({ type: "stop_playback" });
        if (this.session?.isConnected === false) return;
        await this.session
          ?.sendEvent({
            type: KnownClientEventType.ResponseCancel,
            eventId: `evt_bargein_${Date.now()}`,
          })
          .catch((error) => logVoiceLiveIssue("response_cancel", error));
      },
      onInputAudioBufferSpeechStopped: async () => {
        this.emit({ type: "status", state: "thinking" });
      },
      onConversationItemInputAudioTranscriptionCompleted: async (event: { transcript?: string }) => {
        const transcript = event.transcript?.trim() ?? "";
        if (!transcript) return;
        this.emit({ type: "caption.user", text: transcript });
        this.emit({ type: "transcript", role: "user", text: transcript, isFinal: true });
        const result = await this.config.onUserTranscript?.(transcript);
        if (typeof result === "string") await this.speakText(result);
      },
      onServerEvent: async (event: { type?: string; session?: { id?: string } }) => {
        if (event?.type === "session.updated") {
          await this.markReady(event.session?.id);
        }
      },
    };
  }
}

function errorMessage(error: unknown) {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const nested = record.error as Record<string, unknown> | undefined;
    const message = record.message ?? nested?.message;
    if (typeof message === "string") return message;
  }
  return "";
}

function logVoiceLiveIssue(scope: string, error: unknown) {
  const message = errorMessage(error) || String(error);
  const payload =
    error && typeof error === "object"
      ? JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
      : message;
  console.error(`[VoiceLive:${scope}] ${message}`);
  if (payload && payload !== message) console.error(payload);
}

export class AzureVoiceLiveService {
  isConfigured() {
    const apiKey = (
      env.AZURE_VOICELIVE_API_KEY ||
      env.AZURE_SPEECH_KEY ||
      env.AZURE_AI_FOUNDRY_API_KEY ||
      ""
    ).trim();
    const hasRealApiKey = Boolean(apiKey) && !apiKey.toUpperCase().includes("REPLACE_WITH");
    return Boolean(hasRealApiKey && env.AZURE_VOICELIVE_ENDPOINT && env.AZURE_EXISTING_AGENT_NAME);
  }

  assertConfigured() {
    if (!this.isConfigured()) {
      throw new AppError(
        503,
        "Live voice ordering is temporarily unavailable. You can still use the menu and cart.",
        "AZURE_VOICE_LIVE_NOT_CONFIGURED"
      );
    }
  }

  sessionMetadata() {
    return {
      provider: env.LIVE_VOICE_PROVIDER,
      agentName: env.AZURE_EXISTING_AGENT_NAME,
      agentVersion: env.AZURE_EXISTING_AGENT_VERSION,
      projectEndpoint: env.AZURE_AI_ENDPOINT,
      connectionMode: "backend_proxy" as const,
    };
  }

  initialEvents(config: VoiceLiveSessionConfig): VoiceLiveServerEvent[] {
    return [
      {
        type: "session.ready",
        sessionId: config.sessionId,
        agentName: env.AZURE_EXISTING_AGENT_NAME,
        agentVersion: env.AZURE_EXISTING_AGENT_VERSION,
      },
      {
        type: "caption.assistant",
        text: config.greeting || `Welcome to ${config.tenantName}. What would you like to order today?`,
      },
    ];
  }

  unavailableEvent(): VoiceLiveServerEvent {
    return {
      type: "error",
      code: "AZURE_VOICE_LIVE_NOT_CONFIGURED",
      message: "Live voice ordering is temporarily unavailable. You can still use the menu and cart.",
    };
  }
}

export const azureVoiceLiveService = new AzureVoiceLiveService();
