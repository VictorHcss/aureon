/**
 * WhatsApp Cloud API (Meta) — integração OPCIONAL.
 * Mensagens iniciadas pela empresa exigem um modelo (template) aprovado.
 * Este envio usa um modelo com UMA variável no corpo, por exemplo:
 *   Nome: alerta_preco | Categoria: Utilidade | Idioma: pt_BR
 *   Corpo: "Aureon: {{1}}"  (modelos já aprovados com outro texto continuam funcionando)
 * Documentação: https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates
 */
import { ProviderError, type ChannelSender, type OutgoingMessage } from "./types";

/** Parâmetros de modelo não aceitam quebras de linha, tabulações nem 4+ espaços seguidos. */
export function sanitizeTemplateParam(text: string, max = 1000): string {
  const clean = text.replace(/[\r\n\t]+/g, " | ").replace(/ {4,}/g, "   ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export function createWhatsAppSender(opts: {
  token: string;
  phoneNumberId: string;
  to: string;
  templateName: string;
  templateLang: string;
  apiVersion: string;
  fetch: typeof fetch;
  timeoutMs?: number;
}): ChannelSender {
  return {
    channel: "whatsapp",
    async send(message: OutgoingMessage) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15_000);
      try {
        const res = await opts.fetch(`https://graph.facebook.com/${opts.apiVersion}/${opts.phoneNumberId}/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${opts.token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: opts.to.replace(/\D/g, ""),
            type: "template",
            template: {
              name: opts.templateName,
              language: { code: opts.templateLang },
              components: [{ type: "body", parameters: [{ type: "text", text: sanitizeTemplateParam(message.whatsapp) }] }],
            },
          }),
          signal: controller.signal,
        });
        const json = (await res.json().catch(() => null)) as
          | { messages?: { id: string }[]; error?: { message?: string; code?: number } }
          | null;
        if (!res.ok || !json?.messages?.[0]?.id) {
          const detail = json?.error ? `${json.error.message ?? "erro"} (código ${json.error.code ?? "?"})` : `HTTP ${res.status}`;
          throw new ProviderError("whatsapp", `WhatsApp recusou o envio: ${detail}`, res.status === 429 || res.status >= 500);
        }
        return { providerMessageId: json.messages[0].id };
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        throw new ProviderError("whatsapp", controller.signal.aborted ? "Tempo limite ao contatar a Meta." : "Falha de rede ao contatar a Meta.", true);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
