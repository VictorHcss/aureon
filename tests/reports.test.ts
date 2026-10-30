import { describe, expect, it } from "vitest";
import { buildDailyReport } from "@/lib/reports/build";
import { renderAlert, renderDailyReport, safeUrl } from "@/lib/reports/render";
import { sendDailyReport } from "@/lib/jobs/report";
import { createLogger } from "@/lib/logger";
import type { ChannelSender } from "@/lib/notify/types";
import { MemoryRepository, makePrice, makeProduct, makeSource } from "./helpers/memory-repository";

const NOW = new Date("2026-10-27T11:30:00Z");
const logger = createLogger({}, true);

function data() {
  const p1 = makeProduct({ name: "Placa <RTX>", target_price: 2000 });
  const p2 = makeProduct({ name: "Monitor", target_price: null });
  const p3 = makeProduct({ name: "Teclado" });
  const s1 = makeSource(p1.id);
  const s2 = makeSource(p2.id);
  const s3 = makeSource(p3.id, { last_status: "temporary_failure" });
  const history = [
    makePrice(s1.id, 2200, "2026-10-26T11:00:00Z"),
    makePrice(s1.id, 1999, "2026-10-27T11:00:00Z"),
    makePrice(s2.id, 900, "2026-10-26T11:00:00Z"),
    makePrice(s2.id, 990, "2026-10-27T11:00:00Z"),
    makePrice(s3.id, 150, "2026-10-10T11:00:00Z"),
    makePrice(s3.id, null, "2026-10-27T11:00:00Z"),
  ];
  return {
    products: [{ ...p1, sources: [s1] }, { ...p2, sources: [s2] }, { ...p3, sources: [s3] }],
    history,
  };
}

describe("relatório diário", () => {
  it("classifica alvo, quedas, aumentos e desatualizados", () => {
    const d = data();
    const r = buildDailyReport({ ...d, run: null, staleAfterHours: 48, now: NOW });
    expect(r.targetReached.map((i) => i.productName)).toEqual(["Placa <RTX>"]);
    expect(r.drops[0]!.pctChange).toBe(-9.14);
    expect(r.increases[0]!.productName).toBe("Monitor");
    expect(r.stale.map((i) => i.productName)).toEqual(["Teclado"]);
    expect(r.stale[0]!.lastValidAt).toBe("2026-10-10T11:00:00Z");
    expect(r.historicLows.map((i) => i.productName)).toEqual(["Placa <RTX>"]);
  });

  it("renderiza HTML escapado, texto simples e Telegram", () => {
    const d = data();
    const run = { id: "r", run_key: null, trigger: "schedule" as const, started_at: "2026-10-27T11:00:00Z", finished_at: "2026-10-27T11:02:00Z", status: "partial" as const, products_processed: 3, sources_processed: 3, successes: 2, failures: 1, error_summary: null, github_run_id: null };
    const msg = renderDailyReport(buildDailyReport({ ...d, run, staleAfterHours: 48, now: NOW }), "https://painel.example.com");
    expect(msg.html).toContain("Placa &lt;RTX&gt;");
    expect(msg.html).not.toContain("<RTX>");
    expect(msg.html).toContain("parte das consultas falhou");
    expect(msg.text).toContain("Atingiram o preço-alvo (1)");
    expect(msg.text).toContain("Última coleta válida");
    expect(msg.telegram).toContain("Placa &lt;RTX&gt;");
    expect(msg.subject).toContain("1 no alvo");
    expect(msg.whatsapp).not.toMatch(/\n/);
  });

  it("relatório vazio orienta o cadastro", () => {
    const msg = renderDailyReport(buildDailyReport({ products: [], history: [], run: null, staleAfterHours: 48, now: NOW }));
    expect(msg.html).toContain("Cadastre produtos");
  });

  it("links perigosos são neutralizados", () => {
    expect(safeUrl("javascript:alert(1)")).toBe("#");
    expect(safeUrl("https://ok.com/a")).toBe("https://ok.com/a");
  });

  it("alerta contém produto, loja, preço, variação, alvo, link e data", () => {
    const msg = renderAlert({
      ruleId: "r", ruleType: "target_price", productId: "p", productName: "SSD", sourceId: "s", storeName: "Mercado Livre",
      url: "https://produto.mercadolivre.com.br/MLB-1", price: 380, previousPrice: 450, pctChange: -15.56, targetPrice: 400,
      collectedAt: "2026-10-27T11:00:00Z", eventKey: "k", opportunity: true,
    });
    for (const part of ["SSD", "Mercado Livre", "380,00", "−15,6%", "400,00", "MLB-1", "27/10/2026"]) expect(msg.text).toContain(part);
  });

  it("envia o relatório uma vez por dia por canal", async () => {
    const repo = new MemoryRepository();
    const d = data();
    repo.products = d.products.map((p) => { const copy = { ...p } as Partial<typeof p>; delete copy.sources; return copy as typeof p; });
    repo.sources = d.products.flatMap((p) => p.sources);
    repo.history = d.history;
    let calls = 0;
    const sender: ChannelSender = { channel: "email", send: async () => { calls++; return { providerMessageId: "e1" }; } };
    await sendDailyReport({ repo, senders: [sender], logger, now: NOW });
    await sendDailyReport({ repo, senders: [sender], logger, now: NOW });
    expect(calls).toBe(1);
    await sendDailyReport({ repo, senders: [sender], logger, now: NOW, force: true });
    expect(calls).toBe(2);
  });

  it("resumo diário desativado não envia", async () => {
    const repo = new MemoryRepository();
    repo.settings.daily_summary_enabled = false;
    let calls = 0;
    const sender: ChannelSender = { channel: "email", send: async () => { calls++; return { providerMessageId: null }; } };
    await sendDailyReport({ repo, senders: [sender], logger, now: NOW });
    expect(calls).toBe(0);
  });
});
