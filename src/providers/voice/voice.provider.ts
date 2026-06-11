export interface VoiceProvider {
  resolveTenantFromRoutingNumber(routingNumber: string): Promise<{ tenantId: string } | null>;
  startCallSession(input: { tenantId: string; callSid: string }): Promise<{ sessionId: string }>;
}
