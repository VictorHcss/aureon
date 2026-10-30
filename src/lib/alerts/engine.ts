/**
 * Avaliação das regras de alerta. Função pura: recebe dados e devolve os
 * eventos candidatos, cada um com uma chave única (event_key) para
 * deduplicação. Nunca usa coletas inválidas nem dados desatualizados
 * (exceto a regra "stale_data", que existe justamente para isso).
 */
import { computeStats, isStale, percentChange, reachedTarget, validPoints } from "../analytics";
import { toCents } from "../money";
import type { AlertEvent, AlertRule, PriceRecord, ProductSource, RuleType } from "../types";

export interface AlertSourceInput {
  source: ProductSource;
  product: { id: string; name: string; target_price: number | null };
  /** Todas as coletas da fonte (qualquer status). */
  records: PriceRecord[];
}

export interface AlertCandidate {
  ruleId: string;
  ruleType: RuleType;
  productId: string;
  productName: string;
  sourceId: string;
  storeName: string;
  url: string;
  price: number | null;
  previousPrice: number | null;
  pctChange: number | null;
  targetPrice: number | null;
  collectedAt: string | null;
  eventKey: string;
  /** Oportunidade de compra (vs. aviso operacional). */
  opportunity: boolean;
}

export interface EvaluateInput {
  rules: AlertRule[];
  sources: AlertSourceInput[];
  recentEvents: Pick<AlertEvent, "rule_id" | "product_source_id" | "event_key" | "created_at">[];
  staleAfterHours: number;
  now?: Date;
}

const OPPORTUNITY: Record<RuleType, boolean> = {
  target_price: true,
  percent_drop: true,
  historic_low: true,
  abs_change: false,
  back_in_stock: true,
  stale_data: false,
};

export function evaluateAlerts(input: EvaluateInput): AlertCandidate[] {
  const now = input.now ?? new Date();
  const out: AlertCandidate[] = [];
  const existingKeys = new Set(input.recentEvents.map((e) => e.event_key));

  for (const rule of input.rules) {
    if (!rule.active) continue;
    for (const s of input.sources) {
      if (s.product.id !== rule.product_id || !s.source.active) continue;

      const records = [...s.records].sort((a, b) => a.collected_at.localeCompare(b.collected_at));
      const points = validPoints(records);
      const stats = computeStats(points);
      const latest = stats.latest;
      const fresh = latest !== null && !isStale(latest.collectedAt, input.staleAfterHours, now);

      const base = {
        ruleId: rule.id,
        ruleType: rule.rule_type,
        productId: s.product.id,
        productName: s.product.name,
        sourceId: s.source.id,
        storeName: s.source.store_name,
        url: s.source.product_url,
        price: latest?.price ?? null,
        previousPrice: stats.previous?.price ?? null,
        pctChange: stats.pctChange,
        targetPrice: rule.threshold ?? s.product.target_price,
        collectedAt: latest?.collectedAt ?? null,
        opportunity: OPPORTUNITY[rule.rule_type],
      };

      let eventKey: string | null = null;
      switch (rule.rule_type) {
        case "target_price": {
          const target = rule.threshold ?? s.product.target_price;
          if (fresh && reachedTarget(latest!.price, target)) eventKey = `target:${s.source.id}:${toCents(latest!.price)}`;
          break;
        }
        case "percent_drop": {
          if (fresh && rule.threshold && stats.pctChange !== null && stats.pctChange <= -rule.threshold)
            eventKey = `drop:${s.source.id}:${latest!.id}`;
          break;
        }
        case "historic_low": {
          if (fresh && stats.isHistoricLow) eventKey = `low:${s.source.id}:${toCents(latest!.price)}`;
          break;
        }
        case "abs_change": {
          if (fresh && rule.threshold && stats.absChange !== null && Math.abs(stats.absChange) >= rule.threshold)
            eventKey = `abs:${s.source.id}:${latest!.id}`;
          break;
        }
        case "back_in_stock": {
          const last = records.at(-1);
          const prev = records.at(-2);
          if (last && prev && last.collection_status === "success" && prev.collection_status === "unavailable" && fresh)
            eventKey = `stock:${s.source.id}:${last.id}`;
          break;
        }
        case "stale_data": {
          const hours = rule.threshold ?? input.staleAfterHours;
          const reference = s.source.last_success_at ?? s.source.created_at;
          if (isStale(reference, hours, now)) eventKey = `stale:${s.source.id}:${s.source.last_success_at ?? "never"}`;
          break;
        }
      }
      if (!eventKey || existingKeys.has(eventKey)) continue;

      // Período de espera entre alertas repetidos da mesma regra/fonte
      const cooldownMs = rule.cooldown_hours * 3_600_000;
      const inCooldown = input.recentEvents.some(
        (e) =>
          e.rule_id === rule.id &&
          e.product_source_id === s.source.id &&
          now.getTime() - new Date(e.created_at).getTime() < cooldownMs,
      );
      if (inCooldown) continue;

      existingKeys.add(eventKey);
      out.push({ ...base, eventKey });
    }
  }
  return out;
}

export { percentChange };
