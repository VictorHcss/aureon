/**
 * Execução diária (usada pelo GitHub Actions e manualmente).
 *
 *   npm run job:daily                 coleta + alertas + relatório
 *   npm run job:collect               só coleta
 *   npm run job:report                alertas + relatório (sem coletar)
 *   npm run job:test-notify           envia mensagem de teste aos canais habilitados
 *
 * Opções: --skip-collect --skip-alerts --skip-report --test-notify
 *         --dry-run (não envia nada) --force (ignora a trava diária)
 *         --trigger=schedule|manual
 */
import { saoPauloDateKey } from "../src/lib/dates";
import { createJobContext } from "../src/lib/jobs/context";
import { runCollection } from "../src/lib/jobs/collect";
import { processAlerts } from "../src/lib/jobs/alerts";
import { sendDailyReport } from "../src/lib/jobs/report";
import { createLogger, errorMessage } from "../src/lib/logger";
import { deliver } from "../src/lib/notify/dispatcher";
import { buildSenders } from "../src/lib/notify/senders";
import { renderTestMessage } from "../src/lib/reports/render";
import type { RunTrigger } from "../src/lib/types";

const args = new Set(process.argv.slice(2));
const flag = (name: string) => args.has(`--${name}`);
const triggerArg = process.argv.find((a) => a.startsWith("--trigger="))?.split("=")[1];
const trigger: RunTrigger = triggerArg === "schedule" ? "schedule" : "manual";
const executionId = process.env.GITHUB_RUN_ID ?? `local-${Date.now()}`;
const logger = createLogger({ executionId, trigger });

async function main(): Promise<number> {
  const { env, repo, collectorCtx } = createJobContext(logger);
  const settings = await repo.getSettings();
  const senders = buildSenders(env, settings, fetch, logger);
  const dryRun = flag("dry-run");
  let exitCode = 0;

  if (flag("test-notify")) {
    if (!senders.length) {
      logger.error("Nenhum canal habilitado e configurado. Ative um canal no painel (Configurações) e defina as variáveis.");
      return 1;
    }
    const results = await deliver({
      repo, senders, kind: "test", eventKey: `test:${Date.now()}`, message: renderTestMessage(), logger, dryRun,
    });
    logger.info("Teste de notificação concluído", { results });
    return results.some((r) => r.status === "failed") ? 1 : 0;
  }

  if (!flag("skip-collect")) {
    const runKey = trigger === "schedule" && !flag("force") ? `schedule:${saoPauloDateKey()}` : null;
    const outcome = await runCollection({
      repo, ctx: collectorCtx, logger, trigger, runKey, githubRunId: process.env.GITHUB_RUN_ID ?? null,
    });
    if (outcome.skipped) {
      logger.warn("Coleta agendada de hoje já foi executada; seguindo para alertas e relatório.");
    } else if (outcome.status === "failed") {
      console.log(`::error::Coleta falhou: ${outcome.failures} falha(s) e nenhuma consulta bem-sucedida.`);
      exitCode = 1;
    } else if (outcome.status === "partial") {
      console.log(`::warning::Coleta parcial: ${outcome.successes} sucesso(s) e ${outcome.failures} falha(s).`);
      if (env.FAIL_ON_PARTIAL === "true") exitCode = 1;
    }
  }

  if (!flag("skip-alerts")) {
    const alerts = await processAlerts({ repo, senders, logger, dryRun });
    if (alerts.failedDeliveries > 0) console.log(`::warning::${alerts.failedDeliveries} envio(s) de alerta falharam.`);
  }

  if (!flag("skip-report")) {
    const { deliveries, report } = await sendDailyReport({
      repo, senders, logger, appUrl: env.APP_BASE_URL ?? null, dryRun, force: flag("force") && trigger === "manual",
    });
    logger.info("Relatório diário", {
      itens: report.items.length, noAlvo: report.targetReached.length, quedas: report.drops.length, deliveries,
    });
    if (deliveries.some((d) => d.status === "failed")) {
      console.log("::warning::Falha ao enviar o relatório diário em pelo menos um canal.");
    }
  }
  return exitCode;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    logger.error("Execução interrompida", { error: errorMessage(error) });
    console.log(`::error::${errorMessage(error)}`);
    process.exit(1);
  });
