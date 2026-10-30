/** Implementação do Repository sobre o Supabase (PostgreSQL). */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AlertEvent, AlertRule, Channel, CollectionRun, NotificationSettings, PriceRecord, Product, ProductSource,
  SourceWithProduct,
} from "../types";
import type { StoredToken } from "../collectors/mercadolivre-auth";
import { DEFAULT_SETTINGS, type NewAlertEvent, type NewNotificationLog, type NewPriceRecord, type ProductWithSources, type Repository, type RunSummary } from "./repository";

const PAGE = 1000;
const UNIQUE_VIOLATION = "23505";

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`${context}: ${error?.message ?? "erro desconhecido"}`);
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function normalizePrice(row: Record<string, unknown>): PriceRecord {
  return {
    ...(row as unknown as PriceRecord),
    price: num(row.price),
    original_price: num(row.original_price),
    shipping_price: num(row.shipping_price),
  };
}

export function normalizeProduct(row: Record<string, unknown>): Product {
  return { ...(row as unknown as Product), target_price: num(row.target_price), max_price: num(row.max_price) };
}

/** Busca todas as páginas de uma consulta (o PostgREST limita 1000 linhas por resposta). */
export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  context: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) fail(context, error);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

export function createSupabaseRepository(db: SupabaseClient): Repository {
  return {
    async startRun({ trigger, runKey, githubRunId }) {
      const { data, error } = await db
        .from("collection_runs")
        .insert({ trigger, run_key: runKey, github_run_id: githubRunId, status: "running" })
        .select()
        .single();
      if (error?.code === UNIQUE_VIOLATION) return null;
      if (error) fail("Erro ao iniciar execução", error);
      return data as CollectionRun;
    },

    async finishRun(id, summary: RunSummary) {
      const { error } = await db.from("collection_runs").update(summary).eq("id", id);
      if (error) fail("Erro ao finalizar execução", error);
    },

    async getLatestRun() {
      const { data, error } = await db
        .from("collection_runs").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle();
      if (error) fail("Erro ao ler execução", error);
      return (data as CollectionRun | null) ?? null;
    },

    async listCollectableSources() {
      const rows = await fetchAll<Record<string, unknown>>(
        (from, to) =>
          db
            .from("product_sources")
            .select("*, product:products!inner(id, name, target_price, max_price, active, archived_at)")
            .eq("active", true)
            .eq("product.active", true)
            .is("product.archived_at", null)
            .order("created_at")
            .range(from, to),
        "Erro ao listar fontes",
      );
      return rows.map((r) => ({
        ...(r as unknown as SourceWithProduct),
        product: normalizeProduct(r.product as Record<string, unknown>) as SourceWithProduct["product"],
      }));
    },

    async getSourceWithProduct(id) {
      const { data, error } = await db
        .from("product_sources")
        .select("*, product:products!inner(id, name, target_price, max_price, active, archived_at)")
        .eq("id", id)
        .maybeSingle();
      if (error) fail("Erro ao ler fonte", error);
      if (!data) return null;
      const r = data as Record<string, unknown>;
      return {
        ...(r as unknown as SourceWithProduct),
        product: normalizeProduct(r.product as Record<string, unknown>) as SourceWithProduct["product"],
      };
    },

    async updateSourceAfterCollection(id, patch) {
      const { error } = await db.from("product_sources").update(patch).eq("id", id);
      if (error) fail("Erro ao atualizar fonte", error);
    },

    async insertPrice(record: NewPriceRecord) {
      const { error } = await db.from("price_history").insert(record);
      if (error?.code === UNIQUE_VIOLATION) return "duplicate";
      if (error) fail("Erro ao gravar preço", error);
      return "inserted";
    },

    async listHistory(sourceIds) {
      if (!sourceIds.length) return [];
      const out: PriceRecord[] = [];
      // Lotes para não estourar o tamanho da URL
      for (let i = 0; i < sourceIds.length; i += 50) {
        const chunk = sourceIds.slice(i, i + 50);
        const rows = await fetchAll<Record<string, unknown>>(
          (from, to) =>
            db.from("price_history").select("*").in("product_source_id", chunk).order("collected_at").range(from, to),
          "Erro ao ler histórico",
        );
        out.push(...rows.map(normalizePrice));
      }
      return out;
    },

    async listActiveRules() {
      const { data, error } = await db.from("alert_rules").select("*").eq("active", true);
      if (error) fail("Erro ao ler regras", error);
      return (data ?? []).map((r) => ({ ...(r as AlertRule), threshold: num((r as AlertRule).threshold) }));
    },

    async listEventsSince(sinceIso) {
      const rows = await fetchAll<AlertEvent>(
        (from, to) => db.from("alert_events").select("*").gte("created_at", sinceIso).order("created_at").range(from, to),
        "Erro ao ler eventos",
      );
      return rows;
    },

    async insertEvent(event: NewAlertEvent) {
      const { error } = await db.from("alert_events").insert(event);
      if (error?.code === UNIQUE_VIOLATION) return "duplicate";
      if (error) fail("Erro ao gravar evento", error);
      return "inserted";
    },

    async getSettings(): Promise<NotificationSettings> {
      const { data, error } = await db.from("notification_settings").select("*").eq("id", 1).maybeSingle();
      if (error) fail("Erro ao ler configurações", error);
      return { ...DEFAULT_SETTINGS, ...(data ?? {}) } as NotificationSettings;
    },

    async hasSentNotification(channel: Channel, eventKey: string) {
      const { count, error } = await db
        .from("notification_logs")
        .select("id", { count: "exact", head: true })
        .eq("channel", channel)
        .eq("event_key", eventKey)
        .eq("status", "sent");
      if (error) fail("Erro ao consultar notificações", error);
      return (count ?? 0) > 0;
    },

    async logNotification(log: NewNotificationLog) {
      const { error } = await db.from("notification_logs").insert(log);
      // Corrida rara: outro processo registrou o mesmo envio. O envio já foi deduplicado.
      if (error && error.code !== UNIQUE_VIOLATION) fail("Erro ao registrar notificação", error);
    },

    async listMonitoredProducts() {
      const rows = await fetchAll<Record<string, unknown>>(
        (from, to) =>
          db
            .from("products")
            .select("*, sources:product_sources(*)")
            .is("archived_at", null)
            .eq("active", true)
            .order("name")
            .range(from, to),
        "Erro ao listar produtos",
      );
      return rows.map((r) => ({
        ...normalizeProduct(r),
        sources: ((r.sources as ProductSource[] | null) ?? []).filter((s) => s.active),
      })) as ProductWithSources[];
    },

    async getToken(provider: string): Promise<StoredToken | null> {
      const { data, error } = await db.from("integration_tokens").select("*").eq("provider", provider).maybeSingle();
      if (error) fail("Erro ao ler token", error);
      return (data as StoredToken | null) ?? null;
    },

    async saveToken(provider: string, token: StoredToken) {
      const { error } = await db
        .from("integration_tokens")
        .upsert({ provider, ...token, updated_at: new Date().toISOString() });
      if (error) fail("Erro ao salvar token", error);
    },
  };
}
