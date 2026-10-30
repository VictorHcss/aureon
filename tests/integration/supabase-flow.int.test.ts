/**
 * Teste de integração contra um Supabase LOCAL (supabase start) ou PostgREST local.
 * Apaga dados! Só roda com INTEGRATION_ALLOW_RESET=true e URL em localhost.
 *
 *   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_ANON_KEY=... \
 *   INTEGRATION_ALLOW_RESET=true npm run test:integration
 */
import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { setMinInterval } from "@/lib/collectors/http";
import { createSupabaseRepository } from "@/lib/db/supabase-repository";
import { runCollection } from "@/lib/jobs/collect";
import { processAlerts } from "@/lib/jobs/alerts";
import { sendDailyReport } from "@/lib/jobs/report";
import { createLogger } from "@/lib/logger";
import type { ChannelSender } from "@/lib/notify/types";
import { SourceInput } from "@/lib/validation";
import { json, mockFetch } from "../helpers/memory-repository";

const URL_ = process.env.SUPABASE_URL ?? "";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ANON = process.env.SUPABASE_ANON_KEY ?? "";
const allowed = process.env.INTEGRATION_ALLOW_RESET === "true" && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL_);

const db = createClient(URL_ || "http://localhost", KEY || "x", { auth: { persistSession: false } });
const repo = createSupabaseRepository(db);
const logger = createLogger({}, true);

async function reset() {
  for (const t of ["notification_logs", "alert_events", "alert_rules", "price_history", "product_sources", "products", "collection_runs", "integration_tokens"]) {
    const key = t === "integration_tokens" ? "provider" : "id";
    const { error } = await db.from(t).delete().not(key, "is", null);
    if (error) throw new Error(`${t}: ${error.message}`);
  }
}

describe.skipIf(!allowed)("fluxo completo com banco real", () => {
  let productId = "";
  let okSource = "";
  let badSource = "";

  beforeAll(async () => {
    setMinInterval(0);
    await reset();
    const { data: cat } = await db.from("categories").select("id").eq("name", "SSDs e HDs").single();
    const { data: p, error } = await db.from("products").insert({ name: "SSD 1TB", target_price: 400, category_id: cat!.id }).select("id").single();
    if (error) throw error;
    productId = p!.id;
    const s1 = SourceInput.parse({ product_url: "https://produto.mercadolivre.com.br/MLB-2000000001-ssd-_JM" });
    const s2 = SourceInput.parse({ product_url: "https://www.mercadolivre.com.br/ssd/p/MLB2000002", store_name: "ML catálogo" });
    const { data: srcs, error: e2 } = await db.from("product_sources").insert([{ ...s1, product_id: productId }, { ...s2, product_id: productId }]).select("id, external_identifier");
    if (e2) throw e2;
    okSource = srcs!.find((s) => s.external_identifier === "item:MLB2000000001")!.id;
    badSource = srcs!.find((s) => s.external_identifier === "catalog:MLB2000002")!.id;
    // produto arquivado não deve ser coletado
    const { data: arch } = await db.from("products").insert({ name: "Velho", archived_at: new Date().toISOString() }).select("id").single();
    await db.from("product_sources").insert({ product_id: arch!.id, store_name: "ML", product_url: "https://produto.mercadolivre.com.br/MLB-3", source_type: "mercadolivre", external_identifier: "item:MLB3000000003" });
  });

  const day1 = mockFetch([
    [/sale_price/, () => json({}, 404)],
    [/items\/MLB2000000001$/, () => json({ id: "MLB2000000001", price: 450, currency_id: "BRL", status: "active", available_quantity: 3, shipping: { free_shipping: true } })],
    [/products\/MLB2000002$/, () => json({}, 500)],
  ]);
  const day2 = mockFetch([
    [/sale_price/, () => json({}, 404)],
    [/items\/MLB2000000001$/, () => json({ id: "MLB2000000001", price: 389.9, currency_id: "BRL", status: "active", available_quantity: 3, shipping: { free_shipping: true } })],
    [/products\/MLB2000002$/, () => json({ id: "MLB2000002", buy_box_winner: { item_id: "MLB9", price: 395, currency_id: "BRL", seller_id: 1 } })],
  ]);
  const ctx = (f: typeof fetch) => ({ fetch: f, timeoutMs: 2000, backoffMs: 0, getAccessToken: async () => "APP_USR-test" });

  it("coleta parcial grava sucesso e falha sem preço inválido", async () => {
    const out = await runCollection({ repo, ctx: ctx(day1.fetch), logger, trigger: "schedule", runKey: "schedule:2026-10-26" });
    expect(out.status).toBe("partial");
    expect(out.results).toHaveLength(2); // arquivado ignorado
    const { data: hist } = await db.from("price_history").select("*").order("collected_at");
    expect(hist).toHaveLength(2);
    expect(Number(hist!.find((h) => h.product_source_id === okSource)!.price)).toBe(450);
    expect(hist!.find((h) => h.product_source_id === badSource)!.price).toBeNull();
    const { data: src } = await db.from("product_sources").select("*").eq("id", badSource).single();
    expect(src!.last_status).toBe("temporary_failure");
    expect(src!.last_success_at).toBeNull();
    const { data: run } = await db.from("collection_runs").select("*").eq("run_key", "schedule:2026-10-26").single();
    expect(run!.status).toBe("partial");
  });

  it("a mesma chave diária não roda de novo", async () => {
    const out = await runCollection({ repo, ctx: ctx(day1.fetch), logger, trigger: "schedule", runKey: "schedule:2026-10-26" });
    expect(out.skipped).toBe(true);
  });

  it("segundo dia: alerta de preço-alvo enviado uma única vez", async () => {
    await runCollection({ repo, ctx: ctx(day2.fetch), logger, trigger: "schedule", runKey: "schedule:2026-10-27" });
    await db.from("alert_rules").insert([{ product_id: productId, rule_type: "target_price" }, { product_id: productId, rule_type: "percent_drop", threshold: 5 }]);
    await db.from("notification_settings").update({ telegram_enabled: true, telegram_chat_id: "1" }).eq("id", 1);
    const sent: string[] = [];
    const sender: ChannelSender = { channel: "telegram", send: async (m) => { sent.push(m.text); return { providerMessageId: String(sent.length) }; } };
    const a = await processAlerts({ repo, senders: [sender], logger });
    expect(a.newEvents).toBe(3); // alvo em 2 ofertas + queda de 13% na primeira
    const b = await processAlerts({ repo, senders: [sender], logger });
    expect(b.newEvents).toBe(0);
    expect(sent).toHaveLength(3);
    const { count } = await db.from("notification_logs").select("id", { count: "exact", head: true }).eq("status", "sent");
    expect(count).toBe(3);
  });

  it("relatório diário enviado uma vez por dia", async () => {
    let calls = 0;
    const sender: ChannelSender = { channel: "email", send: async () => { calls++; return { providerMessageId: "e" }; } };
    const r1 = await sendDailyReport({ repo, senders: [sender], logger });
    await sendDailyReport({ repo, senders: [sender], logger });
    expect(calls).toBe(1);
    expect(r1.report.targetReached.length).toBe(2);
    expect(r1.report.drops[0]!.pctChange).toBe(-13.36);
  });

  it("token do Mercado Livre é salvo e lido", async () => {
    await repo.saveToken("mercadolivre", { access_token: "a", refresh_token: "TG-1", expires_at: new Date().toISOString() });
    await repo.saveToken("mercadolivre", { access_token: "b", refresh_token: "TG-2", expires_at: new Date().toISOString() });
    expect((await repo.getToken("mercadolivre"))?.refresh_token).toBe("TG-2");
  });

  it("consultas do painel montam a comparação entre lojas", async () => {
    const { loadProductViews } = await import("@/lib/db/queries");
    const [view] = await loadProductViews({ productId });
    expect(view!.sources).toHaveLength(2);
    expect(view!.best!.stats.latest!.price).toBe(389.9);
    expect(view!.reachedTarget).toBe(true);
  });

  it("a chave anon não lê nada (RLS)", async () => {
    if (!ANON) return;
    const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
    const { data, error } = await anon.from("products").select("*");
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });
});
