export interface AiProvider {
  completeToolTurn(input: { tenantId: string; callId: string; transcript: string }): Promise<{
    responseText: string;
    toolCalls: string[];
  }>;
  interpretOrderingTurn?(input: {
    tenant: {
      name: string;
      instructions?: string | null;
    };
    menu: Array<{
      id: string;
      name: string;
      category?: string;
      description?: string;
      price: number;
      available: boolean;
    }>;
    conversation: Array<{ role: "assistant" | "user" | "system"; content: string }>;
    currentDraft: {
      items: Array<{ name: string; quantity: number; unitPrice: number }>;
      fulfilmentType?: string | null;
      customer?: Record<string, unknown>;
    };
    transcript: string;
  }): Promise<{
    intent: "order" | "menu" | "checkout" | "clarify" | "off_topic";
    assistantMessage: string;
    items: Array<{ menuItemId?: string; name?: string; quantity?: number }>;
    fulfilmentType?: "pickup" | "delivery" | null;
    customer?: { name?: string; phone?: string; email?: string; address?: string };
    clarificationNeeded?: boolean;
  }>;
}
