/** E-mail via Resend: https://resend.com/docs/api-reference/emails/send-email */
import { ProviderError, type ChannelSender, type OutgoingMessage } from "./types";

export function createResendSender(opts: { apiKey: string; from: string; to: string[]; fetch: typeof fetch; timeoutMs?: number }): ChannelSender {
  return {
    channel: "email",
    async send(message: OutgoingMessage, idempotencyKey: string) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15_000);
      try {
        const res = await opts.fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${opts.apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey.slice(0, 256),
          },
          body: JSON.stringify({ from: opts.from, to: opts.to, subject: message.subject, html: message.html, text: message.text }),
          signal: controller.signal,
        });
        const json = (await res.json().catch(() => null)) as { id?: string; message?: string; name?: string } | null;
        if (!res.ok) {
          throw new ProviderError("email", `Resend recusou o envio: ${json?.message ?? `HTTP ${res.status}`}`, res.status === 429 || res.status >= 500);
        }
        return { providerMessageId: json?.id ?? null };
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        throw new ProviderError("email", controller.signal.aborted ? "Tempo limite ao contatar o Resend." : "Falha de rede ao contatar o Resend.", true);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
