/** Consultas do painel (somente servidor). */
import "server-only";
import { computeStats, isStale, reachedTarget, totalPrice, validPoints, type SourceStats } from "../analytics";
import type {
  AlertEvent, Category, CollectionRun, NotificationLog, NotificationSettings, PriceRecord, Product, ProductSource,
} from "../types";
import { getServiceClient } from "./client";
import { DEFAULT_SETTINGS } from "./repository";
import { fetchAll, normalizePrice, normalizeProduct } from "./supabase-repository";

export interface SourceView {
  source: ProductSource;
  stats: SourceStats;
  points: { collectedAt: string; price: number }[];
  total: number | null;
  shippingKnown: boolean;
  stale: boolean;
  lastRecord: PriceRecord | null;
}

export interface ProductView {
  product: Product;
  category: Category | null;
  sources: SourceView[];
  best: SourceView | null;
  reachedTarget: boolean;
  stale: boolean;
  hasFailure: boolean;
  lastCheckedAt: string | null;
}

function db() {
  return getServiceClient();
}

function throwIf(error: { message: string } | null, ctx: string) {
  if (error) throw new Error(`${ctx}: ${error.message}`);
}

export async function getSettings(): Promise<NotificationSettings> {
  const { data, error } = await db().from("notification_settings").select("*").eq("id", 1).maybeSingle();
  throwIf(error, "Configurações");
  return { ...DEFAULT_SETTINGS, ...(data ?? {}) } as NotificationSettings;
}

export async function listCategories(): Promise<Category[]> {
  const { data, error } = await db().from("categories").select("id, name").order("name");
  throwIf(error, "Categorias");
  return (data ?? []) as Category[];
}

export async function loadProductViews(opts: { includeArchived?: boolean; productId?: string } = {}): Promise<ProductView[]> {
  const settings = await getSettings();
  const categories = await listCategories();
  const rows = await fetchAll<Record<string, unknown>>((from, to) => {
    let q = db().from("products").select("*, sources:product_sources(*)").order("name").range(from, to);
    if (opts.productId) q = q.eq("id", opts.productId);
    if (!opts.includeArchived) q = q.is("archived_at", null);
    return q;
  }, "Produtos");

  const products = rows.map((r) => ({ product: normalizeProduct(r), sources: (r.sources as ProductSource[]) ?? [] }));
  const sourceIds = products.flatMap((p) => p.sources.map((s) => s.id));
  const history: PriceRecord[] = [];
  for (let i = 0; i < sourceIds.length; i += 50) {
    const chunk = sourceIds.slice(i, i + 50);
    const part = await fetchAll<Record<string, unknown>>(
      (from, to) => db().from("price_history").select("*").in("product_source_id", chunk).order("collected_at").range(from, to),
      "Histórico",
    );
    history.push(...part.map(normalizePrice));
  }
  const bySource = new Map<string, PriceRecord[]>();
  for (const h of history) bySource.set(h.product_source_id, [...(bySource.get(h.product_source_id) ?? []), h]);

  return products.map(({ product, sources }) => {
    const views: SourceView[] = sources
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((source) => {
        const records = bySource.get(source.id) ?? [];
        const points = validPoints(records);
        const stats = computeStats(points);
        const t = stats.latest ? totalPrice(stats.latest.price, stats.latest.shipping) : null;
        return {
          source,
          stats,
          points: points.map((p) => ({ collectedAt: p.collectedAt, price: p.price })),
          total: t?.total ?? null,
          shippingKnown: t?.shippingKnown ?? false,
          stale: isStale(stats.latest?.collectedAt ?? null, settings.stale_after_hours),
          lastRecord: records.at(-1) ?? null,
        };
      });
    const fresh = views.filter((v) => v.source.active && !v.stale && v.total !== null);
    const best = fresh.sort((a, b) => a.total! - b.total!)[0] ?? null;
    const activeSources = views.filter((v) => v.source.active);
    return {
      product,
      category: categories.find((c) => c.id === product.category_id) ?? null,
      sources: views,
      best,
      reachedTarget: best ? reachedTarget(best.stats.latest!.price, product.target_price) : false,
      stale: activeSources.length > 0 && activeSources.every((v) => v.stale),
      hasFailure: activeSources.some((v) => v.source.last_status !== null && v.source.last_status !== "success"),
      lastCheckedAt: activeSources.map((v) => v.source.last_checked_at).filter(Boolean).sort().at(-1) ?? null,
    };
  });
}

export async function listRuns(limit = 30): Promise<CollectionRun[]> {
  const { data, error } = await db().from("collection_runs").select("*").order("started_at", { ascending: false }).limit(limit);
  throwIf(error, "Execuções");
  return (data ?? []) as CollectionRun[];
}

export async function getLastSuccessfulRun(): Promise<CollectionRun | null> {
  const { data, error } = await db()
    .from("collection_runs").select("*").in("status", ["success", "partial"]).gt("successes", 0)
    .order("started_at", { ascending: false }).limit(1).maybeSingle();
  throwIf(error, "Execuções");
  return (data as CollectionRun | null) ?? null;
}

export async function listNotificationLogs(limit = 50): Promise<(NotificationLog & { product_name: string | null })[]> {
  const { data, error } = await db()
    .from("notification_logs").select("*, product:products(name)").order("created_at", { ascending: false }).limit(limit);
  throwIf(error, "Notificações");
  return (data ?? []).map((r) => ({ ...(r as NotificationLog), product_name: (r as { product?: { name: string } | null }).product?.name ?? null }));
}

export async function listRecentAlerts(limit = 8, productId?: string): Promise<(AlertEvent & { product_name: string | null })[]> {
  let q = db().from("alert_events").select("*, product:products(name)").order("created_at", { ascending: false }).limit(limit);
  if (productId) q = q.eq("product_id", productId);
  const { data, error } = await q;
  throwIf(error, "Alertas");
  return (data ?? []).map((r) => ({ ...(r as AlertEvent), product_name: (r as { product?: { name: string } | null }).product?.name ?? null }));
}

export async function listRules(productId: string) {
  const { data, error } = await db().from("alert_rules").select("*").eq("product_id", productId).order("created_at");
  throwIf(error, "Regras");
  return (data ?? []).map((r) => ({ ...r, threshold: r.threshold === null ? null : Number(r.threshold) })) as import("../types").AlertRule[];
}
