import { describe, expect, it } from "vitest";
import { computeStats, validPoints } from "@/lib/analytics";
import { summarizeDashboard } from "@/lib/dashboard";
import type { ProductView, SourceView } from "@/lib/db/queries";
import { buildRows } from "@/components/price-chart";
import { makePrice, makeProduct, makeSource } from "./helpers/memory-repository";

function sourceView(productId: string, prices: number[], over: Partial<SourceView> = {}, store = "Mercado Livre"): SourceView {
  const source = makeSource(productId, { store_name: store });
  const records = prices.map((p, i) => makePrice(source.id, p, `2026-10-0${i + 1}T11:00:00Z`));
  const points = validPoints(records);
  const stats = computeStats(points);
  return {
    source, stats, points: points.map((p) => ({ collectedAt: p.collectedAt, price: p.price })),
    total: stats.latest?.price ?? null, shippingKnown: false, stale: false, lastRecord: records.at(-1) ?? null, ...over,
  };
}

function view(name: string, prices: number[], opts: { target?: number | null; active?: boolean; stale?: boolean; failure?: boolean } = {}): ProductView {
  const product = makeProduct({ name, target_price: opts.target ?? null, active: opts.active ?? true });
  const sv = sourceView(product.id, prices, { stale: opts.stale ?? false });
  const reached = opts.target != null && (sv.stats.latest?.price ?? Infinity) <= opts.target;
  return {
    product, category: null, sources: [sv], best: opts.stale ? null : sv, reachedTarget: reached,
    stale: opts.stale ?? false, hasFailure: opts.failure ?? false, lastCheckedAt: null,
  };
}

describe("resumo da Visão geral", () => {
  const views = [
    view("Queda no alvo", [500, 400], { target: 450 }),
    view("Subiu", [100, 120], { target: 90 }),
    view("Estável", [80, 80]),
    view("Com falha", [60, 60], { failure: true }),
    view("Desatualizado", [70, 50], { stale: true }),
    view("Pausado", [10, 5], { active: false }),
  ];
  const s = summarizeDashboard(views);

  it("conta só produtos ativos", () => {
    expect(s.monitored).toHaveLength(5);
    expect(s.activeOffers).toBe(5);
    expect(s.stores).toBe(1);
  });

  it("quedas e altas ignoram ofertas desatualizadas", () => {
    expect(s.drops).toHaveLength(1);
    expect(s.rises).toHaveLength(1);
  });

  it("alvo, atenção e oportunidades", () => {
    expect(s.onTarget.map((v) => v.product.name)).toEqual(["Queda no alvo"]);
    expect(s.withTarget).toBe(2);
    expect(s.attention.map((v) => v.product.name).sort()).toEqual(["Com falha", "Desatualizado"]);
    expect(s.opportunities.map((v) => v.product.name)).toEqual(["Queda no alvo"]);
  });

  it("gráfico só para produtos com pontos", () => {
    expect(s.chartOptions).toHaveLength(5);
    expect(s.chartOptions[0]!.series[0]!.points).toHaveLength(2);
  });

  it("lista vazia não quebra", () => {
    const e = summarizeDashboard([]);
    expect(e.monitored).toHaveLength(0);
    expect(e.opportunities).toHaveLength(0);
  });
});

describe("linhas do gráfico", () => {
  const now = new Date("2026-10-28T12:00:00Z");
  const series = [
    { name: "A", points: [{ collectedAt: "2026-10-27T11:00:00Z", price: 10 }, { collectedAt: "2026-08-01T11:00:00Z", price: 12 }] },
    { name: "B", points: [{ collectedAt: "2026-10-27T11:00:00Z", price: 11 }] },
  ];
  it("junta séries no mesmo instante e ordena por data", () => {
    const { rows, count } = buildRows(series, null, now);
    expect(count).toBe(3);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ s0: 10, s1: 11 });
  });
  it("respeita o período escolhido", () => {
    const { rows, observedFrom } = buildRows(series, 30, now);
    expect(rows).toHaveLength(1);
    expect(observedFrom).toBe("2026-10-27T11:00:00Z");
  });
});
