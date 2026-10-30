import { describe, expect, it } from "vitest";
import { evaluateAlerts } from "@/lib/alerts/engine";
import { processAlerts } from "@/lib/jobs/alerts";
import { createLogger } from "@/lib/logger";
import type { ChannelSender } from "@/lib/notify/types";
import type { AlertRule } from "@/lib/types";
import { MemoryRepository, makePrice, makeProduct, makeSource, uid } from "./helpers/memory-repository";

const logger = createLogger({}, true);
const NOW = new Date("2026-10-27T11:30:00Z");
const rule = (productId: string, rule_type: AlertRule["rule_type"], threshold: number | null = null, cooldown_hours = 24): AlertRule => ({
  id: uid("rule"), product_id: productId, rule_type, threshold, cooldown_hours, active: true,
});

function scenario(prices: Array<[number | null, string]>, target: number | null = 1000) {
  const product = makeProduct({ name: "RTX", target_price: target });
  const source = makeSource(product.id, { last_success_at: "2026-10-27T11:00:00Z" });
  const records = prices.map(([p, at]) => makePrice(source.id, p, at));
  return { product, source, records };
}

describe("regras de alerta", () => {
  it("preço-alvo atingido gera evento; mesmo preço não repete", () => {
    const s = scenario([[1100, "2026-10-26T11:00:00Z"], [990, "2026-10-27T11:00:00Z"]]);
    const r = rule(s.product.id, "target_price");
    const first = evaluateAlerts({ rules: [r], sources: [s], recentEvents: [], staleAfterHours: 48, now: NOW });
    expect(first).toHaveLength(1);
    expect(first[0]!.eventKey).toBe(`target:${s.source.id}:99000`);
    const again = evaluateAlerts({
      rules: [r], sources: [s], staleAfterHours: 48, now: NOW,
      recentEvents: [{ rule_id: r.id, product_source_id: s.source.id, event_key: first[0]!.eventKey, created_at: "2026-10-27T11:10:00Z" }],
    });
    expect(again).toHaveLength(0);
  });

  it("período de espera bloqueia alerta repetido com preço diferente", () => {
    const s = scenario([[1100, "2026-10-26T11:00:00Z"], [980, "2026-10-27T11:00:00Z"]]);
    const r = rule(s.product.id, "target_price", null, 24);
    const out = evaluateAlerts({
      rules: [r], sources: [s], staleAfterHours: 48, now: NOW,
      recentEvents: [{ rule_id: r.id, product_source_id: s.source.id, event_key: "target:x:99000", created_at: "2026-10-27T01:00:00Z" }],
    });
    expect(out).toHaveLength(0);
  });

  it("não dispara com coleta inválida: a última tentativa falhou e o último preço válido é antigo", () => {
    const s = scenario([[990, "2026-10-20T11:00:00Z"], [null, "2026-10-27T11:00:00Z"]]);
    const out = evaluateAlerts({ rules: [rule(s.product.id, "target_price")], sources: [s], recentEvents: [], staleAfterHours: 48, now: NOW });
    expect(out).toHaveLength(0);
  });

  it("queda percentual mínima", () => {
    const s = scenario([[1000, "2026-10-26T11:00:00Z"], [920, "2026-10-27T11:00:00Z"]], null);
    expect(evaluateAlerts({ rules: [rule(s.product.id, "percent_drop", 5)], sources: [s], recentEvents: [], staleAfterHours: 48, now: NOW })).toHaveLength(1);
    expect(evaluateAlerts({ rules: [rule(s.product.id, "percent_drop", 10)], sources: [s], recentEvents: [], staleAfterHours: 48, now: NOW })).toHaveLength(0);
  });

  it("menor preço histórico e variação absoluta", () => {
    const s = scenario([[1000, "2026-10-25T11:00:00Z"], [1050, "2026-10-26T11:00:00Z"], [950, "2026-10-27T11:00:00Z"]], null);
    const out = evaluateAlerts({
      rules: [rule(s.product.id, "historic_low"), rule(s.product.id, "abs_change", 50)],
      sources: [s], recentEvents: [], staleAfterHours: 48, now: NOW,
    });
    expect(out.map((o) => o.ruleType).sort()).toEqual(["abs_change", "historic_low"]);
  });

  it("produto disponível novamente", () => {
    const product = makeProduct();
    const source = makeSource(product.id);
    const records = [
      makePrice(source.id, null, "2026-10-26T11:00:00Z", { collection_status: "unavailable" }),
      makePrice(source.id, 500, "2026-10-27T11:00:00Z"),
    ];
    const out = evaluateAlerts({ rules: [rule(product.id, "back_in_stock")], sources: [{ product, source, records }], recentEvents: [], staleAfterHours: 48, now: NOW });
    expect(out).toHaveLength(1);
  });

  it("dados desatualizados", () => {
    const product = makeProduct();
    const source = makeSource(product.id, { last_success_at: "2026-10-20T11:00:00Z" });
    const out = evaluateAlerts({ rules: [rule(product.id, "stale_data", 72)], sources: [{ product, source, records: [] }], recentEvents: [], staleAfterHours: 48, now: NOW });
    expect(out[0]!.ruleType).toBe("stale_data");
    expect(out[0]!.opportunity).toBe(false);
  });
});

describe("processamento e envio de alertas", () => {
  function setupRepo() {
    const repo = new MemoryRepository();
    const product = makeProduct({ name: "SSD", target_price: 400 });
    const source = makeSource(product.id, { last_success_at: new Date().toISOString() });
    repo.products.push(product);
    repo.sources.push(source);
    const now = Date.now();
    repo.history.push(
      makePrice(source.id, 450, new Date(now - 86_400_000).toISOString()),
      makePrice(source.id, 380, new Date(now - 60_000).toISOString()),
    );
    repo.rules.push(rule(product.id, "target_price"));
    return repo;
  }

  it("envia uma vez e não repete na execução seguinte", async () => {
    const repo = setupRepo();
    const sent: string[] = [];
    const sender: ChannelSender = { channel: "telegram", send: async (m) => { sent.push(m.telegram); return { providerMessageId: "1" }; } };
    const a = await processAlerts({ repo, senders: [sender], logger });
    const b = await processAlerts({ repo, senders: [sender], logger });
    expect(a.notified).toBe(1);
    expect(b.notified).toBe(0);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("SSD");
    expect(repo.logs.filter((l) => l.status === "sent")).toHaveLength(1);
  });

  it("falha de envio é registrada sem interromper o processamento", async () => {
    const repo = setupRepo();
    const broken: ChannelSender = { channel: "email", send: async () => { throw new Error("Resend recusou: Bearer re_secret_key_123456 inválida"); } };
    const ok: ChannelSender = { channel: "telegram", send: async () => ({ providerMessageId: "9" }) };
    const out = await processAlerts({ repo, senders: [broken, ok], logger });
    expect(out.failedDeliveries).toBe(1);
    expect(out.notified).toBe(1);
    const failed = repo.logs.find((l) => l.status === "failed")!;
    expect(failed.error_message).not.toContain("re_secret_key_123456");
  });

  it("alertas desativados: registra o evento mas não envia", async () => {
    const repo = setupRepo();
    repo.settings.alerts_enabled = false;
    let calls = 0;
    const sender: ChannelSender = { channel: "telegram", send: async () => { calls++; return { providerMessageId: null }; } };
    const out = await processAlerts({ repo, senders: [sender], logger });
    expect(out.newEvents).toBe(1);
    expect(calls).toBe(0);
  });
});
