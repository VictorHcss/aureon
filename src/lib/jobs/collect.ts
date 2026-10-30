/**
 * Execução da coleta: percorre as fontes ativas, chama o coletor de cada
 * uma e registra o resultado. Falha de uma fonte não interrompe as demais.
 */
import { getCollector } from "../collectors/registry";
import type { CollectorContext, CollectorResult } from "../collectors/types";
import { emptyResult } from "../collectors/types";
import { errorMessage, type Logger } from "../logger";
import type { Repository } from "../db/repository";
import type { CollectionRun, RunStatus, RunTrigger, SourceWithProduct } from "../types";

export interface CollectOptions {
  repo: Repository;
  ctx: Omit<CollectorContext, "logger">;
  logger: Logger;
  trigger: RunTrigger;
  /** Chave de idempotência (ex.: "schedule:2026-10-27"). null = sem trava. */
  runKey: string | null;
  githubRunId?: string | null;
  /** Restringe a coleta a estas fontes (ex.: coleta manual pelo painel). */
  sourceIds?: string[];
  now?: () => Date;
}

export interface CollectOutcome {
  run: CollectionRun | null;
  skipped: boolean;
  status: RunStatus;
  successes: number;
  failures: number;
  results: Array<{ sourceId: string; productName: string; status: CollectorResult["status"]; error: string | null }>;
}

export function decideRunStatus(successes: number, failures: number): RunStatus {
  if (successes + failures === 0) return "success";
  if (failures === 0) return "success";
  if (successes === 0) return "failed";
  return "partial";
}

async function collectOne(source: SourceWithProduct, opts: CollectOptions, logger: Logger): Promise<CollectorResult> {
  const collector = getCollector(source.source_type);
  if (!collector) return emptyResult("invalid_source", `Tipo de fonte não suportado: ${source.source_type}`);
  try {
    return await collector.collect(
      { url: source.product_url, externalId: source.external_identifier },
      { ...opts.ctx, logger },
    );
  } catch (error) {
    // Coletores não deveriam lançar, mas protegemos o restante da execução.
    return emptyResult("temporary_failure", errorMessage(error));
  }
}

export async function runCollection(opts: CollectOptions): Promise<CollectOutcome> {
  const now = opts.now ?? (() => new Date());
  const run = await opts.repo.startRun({
    trigger: opts.trigger,
    runKey: opts.runKey,
    githubRunId: opts.githubRunId ?? null,
  });
  if (!run) {
    opts.logger.warn("Execução ignorada: já existe uma coleta com esta chave", { runKey: opts.runKey });
    return { run: null, skipped: true, status: "success", successes: 0, failures: 0, results: [] };
  }
  const log = opts.logger.child({ runId: run.id });
  log.info("Coleta iniciada", { trigger: opts.trigger });

  const results: CollectOutcome["results"] = [];
  let successes = 0;
  let failures = 0;
  const errors: string[] = [];
  const products = new Set<string>();

  try {
    let sources = await opts.repo.listCollectableSources();
    if (opts.sourceIds) sources = sources.filter((s) => opts.sourceIds!.includes(s.id));

    for (const source of sources) {
      products.add(source.product_id);
      const slog = log.child({ sourceId: source.id, product: source.product.name });
      const result = await collectOne(source, opts, slog);
      const at = now().toISOString();
      const ok = result.status === "success";

      try {
        await opts.repo.insertPrice({
          product_source_id: source.id,
          run_id: run.id,
          // Defesa extra: só grava preço quando a coleta é válida
          price: ok ? result.price : null,
          original_price: ok ? result.originalPrice : null,
          shipping_price: ok ? result.shippingPrice : null,
          currency: result.currency,
          availability_status: result.availability,
          collection_status: result.status,
          seller_id: result.sellerId,
          collected_at: at,
          source_url: result.permalink ?? source.product_url,
          metadata: { ...result.metadata, ...(result.error ? { error: result.error } : {}), title: result.title },
        });
        await opts.repo.updateSourceAfterCollection(source.id, {
          last_checked_at: at,
          last_status: result.status,
          last_error: result.error,
          ...(ok ? { last_success_at: at } : {}),
        });
      } catch (error) {
        result.status = "temporary_failure";
        result.error = `Falha ao gravar no banco: ${errorMessage(error)}`;
      }

      if (result.status === "success") successes++;
      else {
        failures++;
        errors.push(`${source.product.name} (${source.store_name}): ${result.error ?? result.status}`);
      }
      slog.info("Fonte processada", { status: result.status, price: result.price, error: result.error });
      results.push({ sourceId: source.id, productName: source.product.name, status: result.status, error: result.error });
    }

    const status = decideRunStatus(successes, failures);
    await opts.repo.finishRun(run.id, {
      status,
      finished_at: now().toISOString(),
      products_processed: products.size,
      sources_processed: results.length,
      successes,
      failures,
      error_summary: errors.length ? errors.slice(0, 20).join("\n").slice(0, 4000) : null,
    });
    log.info("Coleta finalizada", { status, successes, failures });
    return { run, skipped: false, status, successes, failures, results };
  } catch (error) {
    const message = errorMessage(error);
    log.error("Coleta interrompida", { error: message });
    await opts.repo
      .finishRun(run.id, {
        status: "failed",
        finished_at: now().toISOString(),
        products_processed: products.size,
        sources_processed: results.length,
        successes,
        failures: failures + 1,
        error_summary: message,
      })
      .catch(() => undefined);
    return { run, skipped: false, status: "failed", successes, failures: failures + 1, results };
  }
}
