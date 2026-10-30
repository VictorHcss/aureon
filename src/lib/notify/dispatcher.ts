/** Entrega uma mensagem aos canais habilitados, com deduplicação e registro. */
import { errorMessage, type Logger } from "../logger";
import type { Repository } from "../db/repository";
import type { Channel, NotificationKind } from "../types";
import type { ChannelSender, OutgoingMessage } from "./types";

export interface DeliveryResult {
  channel: Channel;
  status: "sent" | "failed" | "duplicate";
  error?: string;
}

export async function deliver(opts: {
  repo: Repository;
  senders: ChannelSender[];
  kind: NotificationKind;
  eventKey: string;
  productId?: string | null;
  message: OutgoingMessage;
  logger: Logger;
  dryRun?: boolean;
}): Promise<DeliveryResult[]> {
  const results: DeliveryResult[] = [];
  for (const sender of opts.senders) {
    const log = opts.logger.child({ channel: sender.channel, eventKey: opts.eventKey });
    try {
      if (await opts.repo.hasSentNotification(sender.channel, opts.eventKey)) {
        log.info("Envio ignorado: evento já notificado neste canal");
        results.push({ channel: sender.channel, status: "duplicate" });
        continue;
      }
      if (opts.dryRun) {
        log.info("Simulação: mensagem não enviada", { subject: opts.message.subject });
        results.push({ channel: sender.channel, status: "duplicate" });
        continue;
      }
      const res = await sender.send(opts.message, `${sender.channel}:${opts.eventKey}`);
      await opts.repo.logNotification({
        channel: sender.channel,
        kind: opts.kind,
        product_id: opts.productId ?? null,
        event_key: opts.eventKey,
        status: "sent",
        provider_message_id: res.providerMessageId,
        error_message: null,
        sent_at: new Date().toISOString(),
      });
      log.info("Notificação enviada");
      results.push({ channel: sender.channel, status: "sent" });
    } catch (error) {
      const message = errorMessage(error);
      log.error("Falha ao enviar notificação", { error: message });
      await opts.repo
        .logNotification({
          channel: sender.channel,
          kind: opts.kind,
          product_id: opts.productId ?? null,
          event_key: opts.eventKey,
          status: "failed",
          provider_message_id: null,
          error_message: message,
          sent_at: null,
        })
        .catch((e) => log.error("Falha ao registrar erro de envio", { error: errorMessage(e) }));
      results.push({ channel: sender.channel, status: "failed", error: message });
    }
  }
  return results;
}
