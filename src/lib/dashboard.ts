/**
 * Números da Visão geral, calculados a partir dos produtos já carregados.
 * Fica fora da página para poder ser testado sem banco e sem React.
 * Nada aqui inventa dados: tudo vem das coletas registradas.
 */
import type { ChartSeries } from "./analytics";
import type { ProductView } from "./db/queries";

export function summarizeDashboard(views: ProductView[]) {
  const monitored = views.filter((v) => v.product.active);
  const activeSources = monitored.flatMap((v) => v.sources.filter((s) => s.source.active));
  const stores = new Set(activeSources.map((s) => s.source.store_name)).size;
  const drops = activeSources.filter((s) => !s.stale && (s.stats.pctChange ?? 0) < 0);
  const rises = activeSources.filter((s) => !s.stale && (s.stats.pctChange ?? 0) > 0);
  const onTarget = monitored.filter((v) => v.reachedTarget);
  const withTarget = monitored.filter((v) => v.product.target_price !== null).length;
  const attention = monitored.filter((v) => v.stale || v.hasFailure);

  const opportunities = monitored
    .filter((v) => v.best && (v.reachedTarget || (v.best.stats.pctChange ?? 0) < 0 || v.best.stats.isHistoricLow))
    .sort((a, b) => Number(b.reachedTarget) - Number(a.reachedTarget) || (a.best!.stats.pctChange ?? 0) - (b.best!.stats.pctChange ?? 0));

  const chartOptions: { id: string; name: string; series: ChartSeries[] }[] = monitored
    .filter((v) => v.sources.some((s) => s.points.length))
    .map((v) => ({
      id: v.product.id,
      name: v.product.name,
      series: v.sources.filter((s) => s.points.length).map((s) => ({ name: s.source.store_name, points: s.points })),
    }));

  return { monitored, activeOffers: activeSources.length, stores, drops, rises, onTarget, withTarget, attention, opportunities, chartOptions };
}
