/** Telegram Bot API (oficial e gratuita): https://core.telegram.org/bots/api#sendmessage */
import { ProviderError, type ChannelSender, type OutgoingMessage } from "./types";

const LIMIT = 4000; // limite da API é 4096 caracteres

export function escapeTelegramHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Divide mensagens longas em blocos, preferindo quebras de linha. */
export function splitMessage(text: string, limit = LIMIT): string[] {
  if (text.length <= limit) return [text];
  const parts: string[] = [];
  let current = "";
  for (const line of text.split("\n")) {
    if ((current + "\n" + line).length > limit && current) {
      parts.push(current);
      current = line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
    while (current.length > limit) {
      parts.push(current.slice(0, limit));
      current = current.slice(limit);
    }
  }
  if (current) parts.push(current);
  return parts;
}

export function createTelegramSender(opts: { token: string; chatId: string; fetch: typeof fetch; timeoutMs?: number }): ChannelSender {
  return {
    channel: "telegram",
    async send(message: OutgoingMessage) {
      let lastId: string | null = null;
      for (const chunk of splitMessage(message.telegram)) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15_000);
        try {
          const res = await opts.fetch(`https://api.telegram.org/bot${opts.token}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: opts.chatId,
              text: chunk,
              parse_mode: "HTML",
              link_preview_options: { is_disabled: true },
            }),
            signal: controller.signal,
          });
          const json = (await res.json().catch(() => null)) as
            | { ok: boolean; description?: string; result?: { message_id?: number } }
            | null;
          if (!res.ok || !json?.ok) {
            throw new ProviderError("telegram", `Telegram recusou a mensagem: ${json?.description ?? `HTTP ${res.status}`}`, res.status === 429 || res.status >= 500);
          }
          lastId = json.result?.message_id != null ? String(json.result.message_id) : lastId;
        } catch (error) {
          if (error instanceof ProviderError) throw error;
          throw new ProviderError("telegram", controller.signal.aborted ? "Tempo limite ao contatar o Telegram." : "Falha de rede ao contatar o Telegram.", true);
        } finally {
          clearTimeout(timer);
        }
      }
      return { providerMessageId: lastId };
    },
  };
}
