import type { Channel } from "../types";

export interface OutgoingMessage {
  subject: string;
  html: string;
  text: string;
  /** Texto com HTML simples aceito pelo Telegram (parse_mode=HTML). */
  telegram: string;
  /** Texto em linha única para o parâmetro do modelo do WhatsApp. */
  whatsapp: string;
}

export interface SendResult {
  providerMessageId: string | null;
}

export interface ChannelSender {
  channel: Channel;
  send(message: OutgoingMessage, idempotencyKey: string): Promise<SendResult>;
}

export class ProviderError extends Error {
  constructor(
    public readonly channel: Channel,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
