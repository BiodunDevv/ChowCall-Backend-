import { env } from "../../config/env.js";
import { AppError } from "../../shared/errors/app-error.js";
import type { AiProvider } from "./ai.provider.js";

type AzureChatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

function requireAzureOpenAiConfig() {
  if (
    !env.AZURE_OPENAI_ENDPOINT ||
    !env.AZURE_OPENAI_API_KEY ||
    !env.AZURE_OPENAI_DEPLOYMENT_NAME
  ) {
    throw new AppError(
      500,
      "Azure OpenAI is not fully configured",
      "AZURE_OPENAI_NOT_CONFIGURED"
    );
  }
}

export const azureOpenAiProvider: AiProvider = {
  async completeToolTurn(input) {
    requireAzureOpenAiConfig();

    const endpoint = new URL(
      `/openai/deployments/${env.AZURE_OPENAI_DEPLOYMENT_NAME}/chat/completions`,
      env.AZURE_OPENAI_ENDPOINT
    );
    endpoint.searchParams.set("api-version", env.AZURE_OPENAI_API_VERSION);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "api-key": env.AZURE_OPENAI_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: env.AZURE_OPENAI_MODEL_NAME || undefined,
        messages: [
          {
            role: "system",
            content:
              "You are ChowCall's restaurant ordering assistant. Use server tools for menu, pricing, payment, and kitchen-ticket actions. Never invent prices, availability, delivery fees, or payment status.",
          },
          {
            role: "user",
            content: `Tenant: ${input.tenantId}\nCall: ${input.callId}\nTranscript:\n${input.transcript}`,
          },
        ],
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      throw new AppError(
        502,
        "Azure OpenAI request failed",
        "AZURE_OPENAI_REQUEST_FAILED",
        await response.text()
      );
    }

    const body = (await response.json()) as AzureChatResponse;
    return {
      responseText: body.choices?.[0]?.message?.content ?? "",
      toolCalls: [],
    };
  },
};
