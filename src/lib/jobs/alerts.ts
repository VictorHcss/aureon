/** Processa as regras de alerta e envia as notificações aplicáveis. */
import { evaluateAlerts, type AlertCandidate } from "../alerts/engine";
import type { Repository } from "../db/repository";
import { errorMessage, type Logger } from "../logger";
import { deliver } from "../notify/dispatcher";
import type { ChannelSender } from "../notify/types";
import { renderAlert } from "../reports/render";

export interface AlertsOutcome {
  candidates: number;
  newEvents: number;
  notified: number;
  failedDeliveries: number;
  events: AlertCandidate[];
}

export async function processAlerts(opts: {
  repo: Repository;
  senders: ChannelSender[];
  logger: Logger;
  now?: Date;
  dryRun?: boolean;
}): Promise<AlertsOutcome> {
  const now = opts.now ?? new Date();
  const settings = await opts.repo.getSettings();
  const rules = await opts.repo.listActiveRules();
  if (!rules.length) {
    opts.logger.info("Nenhuma regra de alerta ativa");
    return { candidates: 0, newEvents: 0, notified: 0, failedDeliveries: 0, events: [] };
  }
  const products = await opts.repo.listMonitoredProducts();
  const sources = products.flatMap((p) => p.sources.map((s) => ({ source: s, product: p })));
  const history = await opts.repo.listHistory(sources.map((s) => s.source.id));
  const maxCooldown = Math.max(24, ...rules.map((r) => r.cooldown_hours));
  const events = await opts.repo.listEventsSince(new Date(now.getTime() - maxCooldown * 3_600_000).toISOString());

  const candidates = evaluateAlerts({
    rules,
    sources: sources.map((s) => ({
      source: s.source,
      product: s.product,
      records: history.filter((h) => h.product_source_id === s.source.id),
    })),
    recentEvents: events,
    staleAfterHours: settings.stale_after_hours,
    now,
  });

  let newEvents = 0;
  let notified = 0;
  let failedDeliveries = 0;
  const processed: AlertCandidate[] = [];
  for (const c of candidates) {
    const log = opts.logger.child({ eventKey: c.eventKey, product: c.productName });
    try {
      if (opts.dryRun) {
        log.info("Simulação: alerta detectado", { rule: c.ruleType });
        processed.push(c);
        continue;
      }
      const inserted = await opts.repo.insertEvent({
        rule_id: c.ruleId,
        product_id: c.productId,
        product_source_id: c.sourceId,
        rule_type: c.ruleType,
        event_key: c.eventKey,
        payload: { price: c.price, previousPrice: c.previousPrice, pctChange: c.pctChange, targetPrice: c.targetPrice, collectedAt: c.collectedAt },
      });
      if (inserted === "duplicate") continue;
      newEvents++;
      processed.push(c);
      if (!settings.alerts_enabled) continue;
      if (settings.only_relevant && !c.opportunity) continue;
      const results = await deliver({
        repo: opts.repo,
        senders: opts.senders,
        kind: "alert",
        eventKey: `alert:${c.eventKey}`,
        productId: c.productId,
        message: renderAlert(c),
        logger: log,
      });
      notified += results.filter((r) => r.status === "sent").length;
      failedDeliveries += results.filter((r) => r.status === "failed").length;
    } catch (error) {
      failedDeliveries++;
      log.error("Erro ao processar alerta", { error: errorMessage(error) });
    }
  }
  opts.logger.info("Alertas processados", { candidates: candidates.length, newEvents, notified, failedDeliveries });
  return { candidates: candidates.length, newEvents, notified, failedDeliveries, events: processed };
}
