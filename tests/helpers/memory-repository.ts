/** Repositório em memória para testes (simula as restrições únicas do banco). */
import type { NewAlertEvent, NewNotificationLog, NewPriceRecord, ProductWithSources, Repository, RunSummary } from "@/lib/db/repository";
import { DEFAULT_SETTINGS } from "@/lib/db/repository";
import type { StoredToken } from "@/lib/collectors/mercadolivre-auth";
import type { AlertEvent, AlertRule, CollectionRun, NotificationLog, NotificationSettings, PriceRecord, Product, ProductSource } from "@/lib/types";

let seq = 0;
export const uid = (p = "id") => `${p}-${++seq}`;

export function makeProduct(over: Partial<Product> = {}): Product {
  return {
    id: uid("prod"), name: "Produto", brand: null, model: null, category_id: null, target_price: null, max_price: null,
    notes: null, active: true, archived_at: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", ...over,
  };
}

export function makeSource(productId: string, over: Partial<ProductSource> = {}): ProductSource {
  return {
    id: uid("src"), product_id: productId, store_name: "Mercado Livre", product_url: "https://produto.mercadolivre.com.br/MLB-1234567890-x",
    source_type: "mercadolivre", external_identifier: "item:MLB1234567890", active: true, last_checked_at: null, last_success_at: null,
    last_status: null, last_error: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", ...over,
  };
}

export function makePrice(sourceId: string, price: number | null, collectedAt: string, over: Partial<PriceRecord> = {}): PriceRecord {
  return {
    id: uid("ph"), product_source_id: sourceId, run_id: null, price, original_price: null, shipping_price: null, currency: "BRL",
    availability_status: price ? "in_stock" : "unknown", collection_status: price ? "success" : "temporary_failure",
    seller_id: null, collected_at: collectedAt, source_url: null, metadata: {}, ...over,
  };
}

export class MemoryRepository implements Repository {
  products: Product[] = [];
  sources: ProductSource[] = [];
  history: PriceRecord[] = [];
  runs: CollectionRun[] = [];
  rules: AlertRule[] = [];
  events: AlertEvent[] = [];
  logs: NotificationLog[] = [];
  settings: NotificationSettings = { ...DEFAULT_SETTINGS };
  tokens = new Map<string, StoredToken>();

  async startRun(input: { trigger: CollectionRun["trigger"]; runKey: string | null; githubRunId: string | null }) {
    if (input.runKey && this.runs.some((r) => r.run_key === input.runKey)) return null;
    const run: CollectionRun = {
      id: uid("run"), run_key: input.runKey, trigger: input.trigger, started_at: new Date().toISOString(), finished_at: null,
      status: "running", products_processed: 0, sources_processed: 0, successes: 0, failures: 0, error_summary: null, github_run_id: input.githubRunId,
    };
    this.runs.push(run);
    return run;
  }
  async finishRun(id: string, summary: RunSummary) {
    Object.assign(this.runs.find((r) => r.id === id)!, summary);
  }
  async getLatestRun() {
    return this.runs.at(-1) ?? null;
  }
  async listCollectableSources() {
    return this.sources
      .filter((s) => s.active)
      .map((s) => ({ ...s, product: this.products.find((p) => p.id === s.product_id)! }))
      .filter((s) => s.product && s.product.active && !s.product.archived_at);
  }
  async getSourceWithProduct(id: string) {
    return (await this.listCollectableSources()).find((s) => s.id === id) ?? null;
  }
  async updateSourceAfterCollection(id: string, patch: Partial<ProductSource>) {
    Object.assign(this.sources.find((s) => s.id === id)!, patch);
  }
  async insertPrice(record: NewPriceRecord) {
    if (record.run_id && this.history.some((h) => h.product_source_id === record.product_source_id && h.run_id === record.run_id)) return "duplicate" as const;
    if (record.collection_status === "success" && !(record.price && record.price > 0)) throw new Error("violates price_history_success_has_price");
    this.history.push({ ...record, id: uid("ph") });
    return "inserted" as const;
  }
  async listHistory(sourceIds: string[]) {
    return this.history.filter((h) => sourceIds.includes(h.product_source_id));
  }
  async listActiveRules() {
    return this.rules.filter((r) => r.active);
  }
  async listEventsSince(sinceIso: string) {
    return this.events.filter((e) => e.created_at >= sinceIso);
  }
  async insertEvent(event: NewAlertEvent) {
    if (this.events.some((e) => e.event_key === event.event_key)) return "duplicate" as const;
    this.events.push({ ...event, id: uid("ev"), created_at: new Date().toISOString() });
    return "inserted" as const;
  }
  async getSettings() {
    return this.settings;
  }
  async hasSentNotification(channel: string, eventKey: string) {
    return this.logs.some((l) => l.channel === channel && l.event_key === eventKey && l.status === "sent");
  }
  async logNotification(log: NewNotificationLog) {
    this.logs.push({ ...log, id: uid("log"), created_at: new Date().toISOString() });
  }
  async listMonitoredProducts(): Promise<ProductWithSources[]> {
    return this.products
      .filter((p) => p.active && !p.archived_at)
      .map((p) => ({ ...p, sources: this.sources.filter((s) => s.product_id === p.id && s.active) }));
  }
  async getToken(provider: string) {
    return this.tokens.get(provider) ?? null;
  }
  async saveToken(provider: string, token: StoredToken) {
    this.tokens.set(provider, token);
  }
}

/** Cria um fetch falso que responde por URL (regex ou função). */
export function mockFetch(routes: Array<[RegExp, (url: string, init?: RequestInit) => Response | Promise<Response>]>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });
    for (const [re, handler] of routes) if (re.test(url)) return handler(url, init);
    return new Response(JSON.stringify({ message: "not mocked" }), { status: 404 });
  }) as typeof fetch;
  return { fetch: fn, calls };
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
