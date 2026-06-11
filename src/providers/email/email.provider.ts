export interface EmailProvider {
  send(input: {
    to: string;
    subject: string;
    html: string;
    text?: string;
    replyTo?: string;
  }): Promise<{ id: string }>;
}
