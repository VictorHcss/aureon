/** Monta os dados do relatório diário a partir do banco (função pura). */
import { computeStats, isStale, reachedTarget, totalPrice, validPoints } from "../analytics";
import type { CollectionRun, CollectionStatus, PriceRecord } from "../types";
import type { ProductWithSources } from "../db/repository";

export interface ReportItem {
  productId: string;
  productName: string;
  sourceId: string;
  storeName: string;
  url: string;
  price: number | null;
  shipping: number | null;
  total: number | null;
  pctChange: number | null;
  absChange: number | null;
  targetPrice: number | null;
  reachedTarget: boolean;
  isHistoricLow: boolean;
  minPrice: number | null;
  lastValidAt: string | null;
  lastStatus: CollectionStatus | null;
  stale: boolean;
}

export interface DailyReport {
  generatedAt: string;
  run: CollectionRun | null;
  totals: { products: number; sources: number; successes: number; failures: number };
  targetReached: ReportItem[];
  drops: ReportItem[];
  increases: ReportItem[];
  historicLows: ReportItem[];
  stale: ReportItem[];
  items: ReportItem[];
  isEmpty: boolean;
}

export function buildDailyReport(input: {
  products: ProductWithSources[];
  history: PriceRecord[];
  run: CollectionRun | null;
  staleAfterHours: number;
  now?: Date;
  limit?: number;
}): DailyReport {
  const now = input.now ?? new Date();
  const limit = input.limit ?? 10;
  const bySource = new Map<string, PriceRecord[]>();
  for (const r of input.history) {
    const list = bySource.get(r.product_source_id) ?? [];
    list.push(r);
    bySource.set(r.product_source_id, list);
  }

  const items: ReportItem[] = [];
  for (const p of input.products) {
    for (const s of p.sources) {
      const stats = computeStats(validPoints(bySource.get(s.id) ?? []));
      const latest = stats.latest;
      const stale = isStale(latest?.collectedAt ?? null, input.staleAfterHours, now);
      const total = latest ? totalPrice(latest.price, latest.shipping) : null;
      items.push({
        productId: p.id,
        productName: p.name,
        sourceId: s.id,
        storeName: s.store_name,
        url: s.product_url,
        price: latest?.price ?? null,
        shipping: latest?.shipping ?? null,
        total: total?.total ?? null,
        pctChange: stats.pctChange,
        absChange: stats.absChange,
        targetPrice: p.target_price,
        reachedTarget: !stale && reachedTarget(latest?.price, p.target_price),
        isHistoricLow: !stale && stats.isHistoricLow,
        minPrice: stats.min,
        lastValidAt: latest?.collectedAt ?? null,
        lastStatus: s.last_status,
        stale,
      });
    }
  }

  const fresh = items.filter((i) => !i.stale && i.price !== null);
  return {
    generatedAt: now.toISOString(),
    run: input.run,
    totals: {
      products: input.products.length,
      sources: items.length,
      successes: input.run?.successes ?? 0,
      failures: input.run?.failures ?? 0,
    },
    targetReached: fresh.filter((i) => i.reachedTarget),
    drops: fresh.filter((i) => (i.pctChange ?? 0) < 0).sort((a, b) => a.pctChange! - b.pctChange!).slice(0, limit),
    increases: fresh.filter((i) => (i.pctChange ?? 0) > 0).sort((a, b) => b.pctChange! - a.pctChange!).slice(0, limit),
    historicLows: fresh.filter((i) => i.isHistoricLow).slice(0, limit),
    stale: items.filter((i) => i.stale),
    items,
    isEmpty: items.length === 0,
  };
}
