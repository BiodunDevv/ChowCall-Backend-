export type MessageInput = {
  to: string;
  body: string;
  channel: "sms" | "whatsapp";
};

export interface MessagingProvider {
  send(input: MessageInput): Promise<{
    providerMessageId: string;
    status: "queued" | "sent";
    metadata?: Record<string, unknown>;
  }>;
}
