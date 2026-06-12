import {
  BedrockRuntimeClient,
  InvokeModelWithBidirectionalStreamCommand,
  type InvokeModelWithBidirectionalStreamInput,
  type InvokeModelWithBidirectionalStreamOutput,
} from "@aws-sdk/client-bedrock-runtime";
import { randomUUID } from "node:crypto";
import { env } from "../../config/env.js";
import { DEFAULT_NOVA_SONIC_VOICE } from "../../config/voice-options.js";
import { AppError } from "../../shared/errors/app-error.js";

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

export type NovaSonicVoiceSettings = {
  provider: "aws_nova_sonic";
  modelId: string;
  language: string;
  voiceId: string;
  speakingStyle: "friendly" | "professional" | "warm" | "fast" | "calm";
  responseSpeed: "normal" | "fast";
  allowInterruptions: boolean;
  captionsEnabledByDefault: boolean;
};

type AwsNovaSonicBridgeConfig = {
  sessionId: string;
  tenantSlug: string;
  tenantName: string;
  greeting: string;
  instructions: string;
  voiceSettings: NovaSonicVoiceSettings;
  onUserTranscript?: (text: string) => Promise<string | void> | string | void;
  send: (event: VoiceLiveServerEvent) => void;
};

type QueueItem = InvokeModelWithBidirectionalStreamInput | null;

class AsyncEventQueue {
  private queue: QueueItem[] = [];
  private waiting: ((value: IteratorResult<InvokeModelWithBidirectionalStreamInput>) => void) | null = null;
  private closed = false;

  push(event: InvokeModelWithBidirectionalStreamInput) {
    if (this.closed) return;
    if (this.waiting) {
      const resolve = this.waiting;
      this.waiting = null;
      resolve({ value: event, done: false });
      return;
    }
    this.queue.push(event);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    if (this.waiting) {
      const resolve = this.waiting;
      this.waiting = null;
      resolve({ value: undefined, done: true });
      return;
    }
    this.queue.push(null);
  }

  async *stream(): AsyncIterable<InvokeModelWithBidirectionalStreamInput> {
    while (true) {
      const next = this.queue.shift();
      if (next === null) return;
      if (next) {
        yield next;
        continue;
      }
      const result = await new Promise<IteratorResult<InvokeModelWithBidirectionalStreamInput>>((resolve) => {
        this.waiting = resolve;
      });
      if (result.done) return;
      yield result.value;
    }
  }
}

export class AwsNovaSonicBridge {
  private queue = new AsyncEventQueue();
  private stopped = false;
  private failed = false;
  private audioInputStarted = false;
  private greetingCompleted = false;
  private assistantTurnActive = false;
  private readonly promptName = `prompt_${randomUUID().replaceAll("-", "")}`;
  private readonly systemContentName = `system_${randomUUID().replaceAll("-", "")}`;
  private readonly greetingContentName = `greeting_${randomUUID().replaceAll("-", "")}`;
  private readonly audioContentName = `audio_${randomUUID().replaceAll("-", "")}`;

  constructor(private readonly config: AwsNovaSonicBridgeConfig) {}

  async start() {
    awsNovaSonicService.assertConfigured();
    this.stopped = false;
    this.failed = false;

    this.queue.push(this.eventInput("sessionStart", {
      inferenceConfiguration: {
        maxTokens: 1024,
        topP: 0.9,
        temperature: 0.7,
      },
    }));
    this.queue.push(this.eventInput("promptStart", {
      promptName: this.promptName,
      textOutputConfiguration: { mediaType: "text/plain" },
      audioOutputConfiguration: {
        audioType: "SPEECH",
        encoding: "base64",
        mediaType: "audio/lpcm",
        sampleRateHertz: 24000,
        sampleSizeBits: 16,
        channelCount: 1,
        voiceId: this.config.voiceSettings.voiceId || "tiffany",
      },
    }));
    this.queue.push(this.eventInput("contentStart", {
      promptName: this.promptName,
      contentName: this.systemContentName,
      type: "TEXT",
      interactive: false,
      role: "SYSTEM",
      textInputConfiguration: { mediaType: "text/plain" },
    }));
    this.queue.push(this.eventInput("textInput", {
      promptName: this.promptName,
      contentName: this.systemContentName,
      content: this.systemPrompt(),
    }));
    this.queue.push(this.eventInput("contentEnd", {
      promptName: this.promptName,
      contentName: this.systemContentName,
    }));
    this.queue.push(this.eventInput("contentStart", {
      promptName: this.promptName,
      contentName: this.greetingContentName,
      type: "TEXT",
      interactive: true,
      role: "USER",
      textInputConfiguration: { mediaType: "text/plain" },
    }));
    this.queue.push(this.eventInput("textInput", {
      promptName: this.promptName,
      contentName: this.greetingContentName,
      content: `Begin this voice ordering session now. Say exactly: "${this.config.greeting}"`,
    }));
    this.queue.push(this.eventInput("contentEnd", {
      promptName: this.promptName,
      contentName: this.greetingContentName,
    }));
    void this.runBedrockStream();
  }

  async sendAudio(audioBase64?: string) {
    if (!audioBase64 || !this.audioInputStarted || this.stopped || this.failed) return;
    this.queue.push(this.eventInput("audioInput", {
      promptName: this.promptName,
      contentName: this.audioContentName,
      content: audioBase64,
    }));
  }

  async stop() {
    this.stopped = true;
    if (this.audioInputStarted) {
      this.queue.push(this.eventInput("contentEnd", {
        promptName: this.promptName,
        contentName: this.audioContentName,
      }));
    }
    this.queue.push(this.eventInput("promptEnd", { promptName: this.promptName }));
    this.queue.push(this.eventInput("sessionEnd", {}));
    this.queue.close();
  }

  private async runBedrockStream() {
    try {
      const client = new BedrockRuntimeClient({
        region: env.AWS_REGION,
        authSchemePreference: ["sigv4"],
      });
      const response = await client.send(
        new InvokeModelWithBidirectionalStreamCommand({
          modelId: this.config.voiceSettings.modelId,
          body: this.queue.stream(),
        }),
      );

      // The Bedrock stream is now established. Only now should the browser
      // begin sending microphone audio or play the restaurant greeting.
      this.emit({
        type: "session_started",
        session_id: this.config.sessionId,
        config: {
          provider: "aws_nova_sonic",
          modelId: this.config.voiceSettings.modelId,
          voiceId: this.config.voiceSettings.voiceId,
          language: this.config.voiceSettings.language,
        },
      });
      this.emit({
        type: "session.ready",
        sessionId: this.config.sessionId,
        agentName: "Amazon Nova Sonic",
        agentVersion: this.config.voiceSettings.modelId,
      });
      this.emit({ type: "caption.assistant", text: this.config.greeting });
      this.emit({ type: "status", state: "thinking" });
      setTimeout(() => {
        if (!this.stopped && !this.failed && !this.audioInputStarted) {
          console.warn(`[NovaSonic:startup] Greeting response timed out for ${this.config.sessionId}; opening microphone input.`);
          this.startAudioInput();
        }
      }, 8_000);

      for await (const event of response.body ?? []) {
        if (this.stopped || this.failed) break;
        await this.handleBedrockOutput(event);
      }
    } catch (error) {
      await this.fail("stream", error);
    }
  }

  private async handleBedrockOutput(event: InvokeModelWithBidirectionalStreamOutput) {
    if ("chunk" in event && event.chunk?.bytes) {
      const bytes = event.chunk.bytes;
      const parsed = tryParseJson(bytes);
      if (parsed) {
        await this.handleModelEvent(parsed);
        return;
      }
      const audio = Buffer.from(bytes).toString("base64");
      this.emit({
        type: "audio_data",
        data: audio,
        format: "pcm16",
        sampleRate: 24000,
        channels: 1,
      });
      return;
    }

    const message =
      event.internalServerException?.message ||
      event.modelStreamErrorException?.message ||
      event.modelTimeoutException?.message ||
      event.serviceUnavailableException?.message ||
      event.throttlingException?.message ||
      event.validationException?.message;
    if (message) await this.fail("model_event", new Error(message));
  }

  private async handleModelEvent(event: Record<string, unknown>) {
    const bedrockEvent = event.event && typeof event.event === "object" && !Array.isArray(event.event)
      ? (event.event as Record<string, unknown>)
      : null;

    if (bedrockEvent) {
      await this.handleNovaEvent(bedrockEvent);
      return;
    }

    const type = String(event.type ?? event.eventType ?? event.kind ?? "");
    const role = String(event.role ?? "");
    const text =
      stringValue(event.text) ||
      stringValue(event.transcript) ||
      stringValue(event.message) ||
      stringValue(event.delta);
    const final = event.isFinal === true || event.final === true || type.includes("final");

    if (type.includes("speech_started") || type.includes("input_audio")) {
      this.emit({ type: "status", state: "listening" });
    }
    if (type.includes("thinking") || type.includes("turn_end")) {
      this.emit({ type: "status", state: "thinking" });
    }

    if (text && (role === "user" || type.includes("user") || type.includes("input"))) {
      this.emit({ type: "caption.user", text });
      this.emit({ type: "transcript", role: "user", text, isFinal: final });
      if (final) {
        this.emit({ type: "status", state: "thinking" });
        const assistantText = await this.config.onUserTranscript?.(text);
        if (typeof assistantText === "string" && assistantText.trim()) {
          this.emit({ type: "caption.assistant", text: assistantText });
          this.emit({ type: "transcript", role: "assistant", text: assistantText, isFinal: true });
        }
      }
      return;
    }

    if (text && (role === "assistant" || type.includes("assistant") || type.includes("output"))) {
      this.emit({ type: "status", state: "speaking" });
      this.emit({ type: "caption.assistant", text });
      this.emit({ type: "transcript", role: "assistant", text, isFinal: final });
    }
  }

  private async handleNovaEvent(event: Record<string, unknown>) {
    const textOutput = recordValue(event.textOutput);
    if (textOutput) {
      const text = stringValue(textOutput.content);
      if (text) {
        this.emit({ type: "status", state: "speaking" });
        this.emit({ type: "caption.assistant", text });
        this.emit({ type: "transcript", role: "assistant", text, isFinal: true });
      }
      return;
    }

    const audioOutput = recordValue(event.audioOutput);
    if (audioOutput) {
      const audio = stringValue(audioOutput.content);
      if (audio) {
        this.emit({ type: "status", state: "speaking" });
        this.emit({
          type: "audio_data",
          data: audio,
          format: "pcm16",
          sampleRate: 24000,
          channels: 1,
        });
      }
      return;
    }

    const contentStart = recordValue(event.contentStart);
    if (contentStart) {
      const role = String(contentStart.role ?? "").toLowerCase();
      if (role === "assistant") {
        this.assistantTurnActive = true;
        this.emit({ type: "status", state: "speaking" });
      }
      if (role === "user") this.emit({ type: "status", state: "listening" });
      return;
    }

    const contentEnd = recordValue(event.contentEnd);
    if (contentEnd) {
      if (!this.assistantTurnActive) return;
      this.assistantTurnActive = false;
      if (!this.greetingCompleted) {
        this.greetingCompleted = true;
        this.startAudioInput();
      } else if (this.audioInputStarted) {
        this.emit({ type: "status", state: "listening" });
      }
      return;
    }

    const transcript = recordValue(event.inputTranscript) || recordValue(event.transcript);
    if (transcript) {
      const text = stringValue(transcript.content) || stringValue(transcript.text);
      if (text) {
        this.emit({ type: "caption.user", text });
        this.emit({ type: "transcript", role: "user", text, isFinal: true });
        this.emit({ type: "status", state: "thinking" });
        const assistantText = await this.config.onUserTranscript?.(text);
        if (typeof assistantText === "string" && assistantText.trim()) {
          this.emit({ type: "caption.assistant", text: assistantText });
          this.emit({ type: "transcript", role: "assistant", text: assistantText, isFinal: true });
        }
      }
      return;
    }

    const error =
      recordValue(event.internalServerException) ||
      recordValue(event.modelStreamErrorException) ||
      recordValue(event.modelTimeoutException) ||
      recordValue(event.serviceUnavailableException) ||
      recordValue(event.throttlingException) ||
      recordValue(event.validationException);
    if (error) {
      await this.fail("model_event", new Error(stringValue(error.message) || "Nova Sonic stream error"));
    }
  }

  private eventInput(eventName: string, payload: Record<string, unknown>): InvokeModelWithBidirectionalStreamInput {
    return {
      chunk: {
        bytes: new TextEncoder().encode(JSON.stringify({ event: { [eventName]: payload } })),
      },
    };
  }

  private startAudioInput() {
    if (this.audioInputStarted || this.stopped || this.failed) return;
    this.audioInputStarted = true;
    this.queue.push(this.eventInput("contentStart", {
      promptName: this.promptName,
      contentName: this.audioContentName,
      type: "AUDIO",
      interactive: true,
      role: "USER",
      audioInputConfiguration: {
        audioType: "SPEECH",
        encoding: "base64",
        mediaType: "audio/lpcm",
        sampleRateHertz: 16000,
        sampleSizeBits: 16,
        channelCount: 1,
      },
    }));
    this.emit({ type: "status", state: "listening" });
  }

  private systemPrompt() {
    return [
      this.config.instructions,
      "",
      `Restaurant: ${this.config.tenantName}`,
      `Greeting to use naturally when starting: ${this.config.greeting}`,
      "You are handling a live restaurant voice order for ChowCall.",
      "Keep spoken replies short and clear. Ask one focused question when details are missing.",
      "Never invent menu items, prices, fees, payment status, delivery fees, or preparation status.",
      "If the customer asks for the menu, summarize available items and mention they can tap the Menu button to view everything.",
      "If a request is not about ordering food from this restaurant, gently redirect back to ordering.",
    ].filter(Boolean).join("\n");
  }

  private emit(event: VoiceLiveServerEvent) {
    if (!this.stopped) this.config.send(event);
  }

  private async fail(scope: string, error: unknown) {
    if (this.stopped || this.failed) return;
    this.failed = true;
    this.queue.close();
    logNovaSonicIssue(scope, error);
    this.emit({
      type: "error",
      code: "AWS_NOVA_SONIC_ERROR",
      message: novaErrorMessage(error),
    });
  }
}

function tryParseJson(bytes: Uint8Array) {
  const text = new TextDecoder().decode(bytes).trim();
  if (!text.startsWith("{") && !text.startsWith("[")) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function recordValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function novaErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.toLowerCase().includes("access") || message.toLowerCase().includes("denied")) {
    return "Nova Sonic model access is not enabled for this AWS account or region.";
  }
  if (message.toLowerCase().includes("api keys")) {
    return "Nova Sonic live voice requires AWS IAM credentials, not a Bedrock API key.";
  }
  if (message.toLowerCase().includes("token") || message.toLowerCase().includes("credential")) {
    return "Live voice ordering needs AWS IAM credentials for Bedrock streaming.";
  }
  return "Live voice ordering is temporarily unavailable. You can still use the menu and cart.";
}

function logNovaSonicIssue(scope: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[NovaSonic:${scope}] ${message}`);
}

export class AwsNovaSonicService {
  isConfigured() {
    const hasEnvCredentials = Boolean(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY);
    return (
      env.LIVE_VOICE_PROVIDER === "aws_nova_sonic" &&
      hasEnvCredentials &&
      Boolean(env.AWS_REGION) &&
      Boolean(env.BEDROCK_SONIC_MODEL_ID)
    );
  }

  assertConfigured() {
    if (!this.isConfigured()) {
      throw new AppError(
        503,
        "Nova Sonic live voice requires AWS IAM credentials. You can still use the menu and cart.",
        "AWS_NOVA_SONIC_NOT_CONFIGURED",
      );
    }
  }

  sessionMetadata() {
    return {
      provider: "aws_nova_sonic" as const,
      agentName: "Amazon Nova Sonic",
      agentVersion: env.BEDROCK_SONIC_MODEL_ID,
      modelId: env.BEDROCK_SONIC_MODEL_ID,
      connectionMode: "backend_proxy" as const,
    };
  }

  unavailableEvent(): VoiceLiveServerEvent {
    return {
      type: "error",
      code: "AWS_NOVA_SONIC_NOT_CONFIGURED",
      message: "Nova Sonic live voice requires AWS IAM credentials. You can still use the menu and cart.",
    };
  }

  defaultVoiceSettings() {
    return DEFAULT_NOVA_SONIC_VOICE;
  }
}

export const awsNovaSonicService = new AwsNovaSonicService();
