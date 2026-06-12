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

type OrderingInterpretation = {
  intent?: string;
  assistantMessage?: string;
  items?: Array<{ menuItemId?: string; name?: string; quantity?: number }>;
  fulfilmentType?: "pickup" | "delivery" | null;
  customer?: { name?: string; phone?: string; email?: string; address?: string };
  clarificationNeeded?: boolean;
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

  async interpretOrderingTurn(input) {
    requireAzureOpenAiConfig();

    const endpoint = new URL(
      `/openai/deployments/${env.AZURE_OPENAI_DEPLOYMENT_NAME}/chat/completions`,
      env.AZURE_OPENAI_ENDPOINT
    );
    endpoint.searchParams.set("api-version", env.AZURE_OPENAI_API_VERSION);

    const menuText = input.menu
      .map((item) => {
        const status = item.available ? "available" : "sold out";
        const category = item.category ? `${item.category} · ` : "";
        return `- ${item.id}: ${category}${item.name} (${status}) NGN ${item.price}${item.description ? ` — ${item.description}` : ""}`;
      })
      .join("\n");

    const conversation = input.conversation
      .slice(-8)
      .map((message) => `${message.role}: ${message.content}`)
      .join("\n");

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
            content: [
              "You are ChowCall's web AI voice ordering assistant for Nigerian restaurants.",
              "Return only valid JSON. Do not wrap it in markdown.",
              "Use only menu items provided in context. Never invent items, prices, discounts, delivery fees, payment status, or availability.",
              "If the customer asks for menu, summarize all available menu items by category and tell them they can also tap the Menu button to view everything.",
              "If the customer is unclear, asks for an unavailable item, or says something not related to food ordering, ask one calm follow-up question and do not add items.",
              "Do not jump to checkout until items, pickup/delivery, customer phone, and customer name are known. Delivery also needs an address.",
              "Respect tenant house rules when relevant.",
              "Schema: {\"intent\":\"order|menu|checkout|clarify|off_topic\",\"assistantMessage\":\"string\",\"items\":[{\"menuItemId\":\"string\",\"name\":\"string\",\"quantity\":number}],\"fulfilmentType\":\"pickup|delivery|null\",\"customer\":{\"name\":\"string\",\"phone\":\"string\",\"email\":\"string\",\"address\":\"string\"},\"clarificationNeeded\":boolean}",
            ].join("\n"),
          },
          {
            role: "user",
            content: [
              `Restaurant: ${input.tenant.name}`,
              `House rules: ${input.tenant.instructions || "None"}`,
              "Menu:",
              menuText || "No menu items available.",
              "Current draft:",
              JSON.stringify(input.currentDraft),
              "Recent conversation:",
              conversation || "No previous turns.",
              `Customer said: ${input.transcript}`,
            ].join("\n\n"),
          },
        ],
        temperature: 0.1,
        response_format: { type: "json_object" },
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
    const content = body.choices?.[0]?.message?.content ?? "{}";
    let parsed: OrderingInterpretation;
    try {
      parsed = JSON.parse(content) as OrderingInterpretation;
    } catch {
      throw new AppError(502, "Azure OpenAI returned invalid JSON", "AZURE_OPENAI_INVALID_JSON");
    }

    const intent = ["order", "menu", "checkout", "clarify", "off_topic"].includes(parsed.intent ?? "")
      ? parsed.intent as "order" | "menu" | "checkout" | "clarify" | "off_topic"
      : "clarify";

    return {
      intent,
      assistantMessage: typeof parsed.assistantMessage === "string" ? parsed.assistantMessage : "",
      items: Array.isArray(parsed.items) ? parsed.items : [],
      fulfilmentType: parsed.fulfilmentType === "pickup" || parsed.fulfilmentType === "delivery" ? parsed.fulfilmentType : null,
      customer: parsed.customer ?? {},
      clarificationNeeded: Boolean(parsed.clarificationNeeded),
    };
  },
};
