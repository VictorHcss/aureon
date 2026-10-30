/** Gera e envia o relatório diário (uma vez por dia por canal). */
import { saoPauloDateKey } from "../dates";
import type { Repository } from "../db/repository";
import type { Logger } from "../logger";
import { deliver, type DeliveryResult } from "../notify/dispatcher";
import type { ChannelSender } from "../notify/types";
import { buildDailyReport, type DailyReport } from "../reports/build";
import { renderDailyReport } from "../reports/render";

export async function generateDailyReport(repo: Repository, now = new Date()): Promise<DailyReport> {
  const settings = await repo.getSettings();
  const products = await repo.listMonitoredProducts();
  const history = await repo.listHistory(products.flatMap((p) => p.sources.map((s) => s.id)));
  const run = await repo.getLatestRun();
  return buildDailyReport({ products, history, run, staleAfterHours: settings.stale_after_hours, now });
}

export async function sendDailyReport(opts: {
  repo: Repository;
  senders: ChannelSender[];
  logger: Logger;
  appUrl?: string | null;
  now?: Date;
  dryRun?: boolean;
  /** Reenvia mesmo que o relatório do dia já tenha sido enviado. */
  force?: boolean;
}): Promise<{ report: DailyReport; deliveries: DeliveryResult[] }> {
  const now = opts.now ?? new Date();
  const settings = await opts.repo.getSettings();
  const report = await generateDailyReport(opts.repo, now);
  if (!settings.daily_summary_enabled) {
    opts.logger.info("Resumo diário desativado nas configurações");
    return { report, deliveries: [] };
  }
  if (!opts.senders.length) {
    opts.logger.warn("Nenhum canal de notificação habilitado e configurado; relatório não enviado.");
    return { report, deliveries: [] };
  }
  const key = `daily:${saoPauloDateKey(now)}${opts.force ? `:forced:${now.getTime()}` : ""}`;
  const deliveries = await deliver({
    repo: opts.repo,
    senders: opts.senders,
    kind: "daily_report",
    eventKey: key,
    message: renderDailyReport(report, opts.appUrl),
    logger: opts.logger,
    dryRun: opts.dryRun,
  });
  return { report, deliveries };
}
