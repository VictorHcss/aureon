/** Cálculos de histórico e variação. Funções puras e testáveis. */
import { roundMoney } from "./money";
import type { PriceRecord } from "./types";

export interface PricePoint {
  id: string;
  price: number;
  shipping: number | null;
  collectedAt: string;
}

/** Uma linha do gráfico: o nome da loja e seus pontos (data, preço). */
export interface ChartSeries {
  name: string;
  points: { collectedAt: string; price: number }[];
}

export interface SourceStats {
  latest: PricePoint | null;
  previous: PricePoint | null;
  absChange: number | null;
  pctChange: number | null;
  min: number | null;
  minAt: string | null;
  max: number | null;
  avg: number | null;
  firstAt: string | null;
  samples: number;
  /** O último preço é o menor já registrado (e há histórico anterior para comparar). */
  isHistoricLow: boolean;
}

/** Somente coletas de sucesso com preço válido entram nos cálculos. */
export function validPoints(records: PriceRecord[]): PricePoint[] {
  return records
    .filter((r) => r.collection_status === "success" && typeof r.price === "number" && r.price > 0)
    .map((r) => ({ id: r.id, price: Number(r.price), shipping: r.shipping_price, collectedAt: r.collected_at }))
    .sort((a, b) => a.collectedAt.localeCompare(b.collectedAt));
}

export function percentChange(from: number, to: number): number | null {
  if (!(from > 0)) return null;
  return roundMoney(((to - from) / from) * 100);
}

export function computeStats(points: PricePoint[]): SourceStats {
  const sorted = [...points].sort((a, b) => a.collectedAt.localeCompare(b.collectedAt));
  const latest = sorted.at(-1) ?? null;
  const previous = sorted.length > 1 ? (sorted.at(-2) ?? null) : null;
  if (!latest) {
    return {
      latest: null, previous: null, absChange: null, pctChange: null, min: null, minAt: null,
      max: null, avg: null, firstAt: null, samples: 0, isHistoricLow: false,
    };
  }
  let min = sorted[0]!;
  let max = sorted[0]!.price;
  let sum = 0;
  for (const p of sorted) {
    if (p.price < min.price) min = p;
    if (p.price > max) max = p.price;
    sum += p.price;
  }
  const before = sorted.slice(0, -1);
  const prevMin = before.length ? Math.min(...before.map((p) => p.price)) : null;
  return {
    latest,
    previous,
    absChange: previous ? roundMoney(latest.price - previous.price) : null,
    pctChange: previous ? percentChange(previous.price, latest.price) : null,
    min: min.price,
    minAt: min.collectedAt,
    max,
    avg: roundMoney(sum / sorted.length),
    firstAt: sorted[0]!.collectedAt,
    samples: sorted.length,
    isHistoricLow: prevMin !== null && latest.price < prevMin,
  };
}

export const PERIODS = [
  { key: "7", label: "7 dias", days: 7 },
  { key: "30", label: "30 dias", days: 30 },
  { key: "90", label: "90 dias", days: 90 },
  { key: "180", label: "180 dias", days: 180 },
  { key: "all", label: "Todo o período", days: null },
] as const;

export function filterByDays<T extends { collectedAt: string }>(points: T[], days: number | null, now = new Date()): T[] {
  if (days === null) return points;
  const cutoff = now.getTime() - days * 86_400_000;
  return points.filter((p) => new Date(p.collectedAt).getTime() >= cutoff);
}

/** Preço total estimado: só soma o frete quando ele é conhecido. */
export function totalPrice(price: number, shipping: number | null): { total: number; shippingKnown: boolean } {
  if (shipping === null || shipping === undefined) return { total: price, shippingKnown: false };
  return { total: roundMoney(price + shipping), shippingKnown: true };
}

export function reachedTarget(price: number | null | undefined, target: number | null | undefined): boolean {
  if (typeof price !== "number" || typeof target !== "number") return false;
  return price > 0 && target > 0 && price <= target;
}

export function isStale(lastSuccessAt: string | null, staleAfterHours: number, now = new Date()): boolean {
  if (!lastSuccessAt) return true;
  return now.getTime() - new Date(lastSuccessAt).getTime() > staleAfterHours * 3_600_000;
}
