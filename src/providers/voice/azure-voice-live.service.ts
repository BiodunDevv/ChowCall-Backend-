import { env } from "../../config/env.js";
import { AppError } from "../../shared/errors/app-error.js";

export type VoiceLiveClientEvent =
  | { type: "session.start" }
  | { type: "audio.chunk"; audio?: string }
  | { type: "audio.mute" }
  | { type: "audio.unmute" }
  | { type: "session.end" };

export type VoiceLiveServerEvent =
  | { type: "session.ready"; sessionId: string; agentName: string; agentVersion: string }
  | { type: "caption.user"; text: string }
  | { type: "caption.assistant"; text: string }
  | { type: "order.updated"; order: unknown }
  | { type: "payment.ready"; orderId?: string; authorizationUrl?: string }
  | { type: "payment.pending"; orderId?: string }
  | { type: "payment.paid"; orderId?: string }
  | { type: "error"; message: string; code: string }
  | { type: "session.ended" };

export type VoiceLiveSessionConfig = {
  sessionId: string;
  tenantSlug: string;
  tenantName: string;
  greeting: string;
};

export class AzureVoiceLiveService {
  isConfigured() {
    const apiKey = env.AZURE_AI_FOUNDRY_API_KEY?.trim() ?? "";
    const hasRealApiKey = Boolean(apiKey) && !apiKey.toUpperCase().includes("REPLACE_WITH");
    return Boolean(hasRealApiKey && env.AZURE_AI_ENDPOINT && env.AZURE_EXISTING_AGENT_NAME);
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
