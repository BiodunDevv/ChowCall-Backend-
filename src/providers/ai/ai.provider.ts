export interface AiProvider {
  completeToolTurn(input: { tenantId: string; callId: string; transcript: string }): Promise<{
    responseText: string;
    toolCalls: string[];
  }>;
}
