import { beforeAll, describe, expect, it } from "vitest";
import { setMinInterval } from "@/lib/collectors/http";
import { decideRunStatus, runCollection } from "@/lib/jobs/collect";
import { createLogger } from "@/lib/logger";
import { MemoryRepository, json, makePrice, makeProduct, makeSource, mockFetch } from "./helpers/memory-repository";

beforeAll(() => setMinInterval(0));
const logger = createLogger({}, true);

function setup() {
  const repo = new MemoryRepository();
  const p1 = makeProduct({ name: "SSD" });
  const p2 = makeProduct({ name: "Monitor" });
  const archived = makeProduct({ name: "Arquivado", archived_at: "2026-01-01T00:00:00Z" });
  repo.products.push(p1, p2, archived);
  const ok = makeSource(p1.id, { external_identifier: "item:MLB1000000001" });
  const broken = makeSource(p2.id, { external_identifier: "item:MLB1000000002" });
  const ignored = makeSource(archived.id, { external_identifier: "item:MLB1000000003" });
  repo.sources.push(ok, broken, ignored);
  const m = mockFetch([
    [/sale_price/, () => json({}, 404)],
    [/MLB1000000001$/, () => json({ id: "MLB1000000001", price: 500, currency_id: "BRL", status: "active", available_quantity: 1 })],
    [/MLB1000000002$/, () => json({ error: "boom" }, 500)],
    [/MLB1000000003$/, () => json({ id: "MLB1000000003", price: 1, currency_id: "BRL", status: "active" })],
  ]);
  const ctx = { fetch: m.fetch, timeoutMs: 1000, backoffMs: 0, getAccessToken: async () => "APP_USR-t" };
  return { repo, ok, broken, ignored, m, ctx };
}

describe("fluxo completo de coleta", () => {
  it("uma loja falhando não interrompe as demais e a execução fica 'partial'", async () => {
    const { repo, ok, broken, ctx } = setup();
    const out = await runCollection({ repo, ctx, logger, trigger: "manual", runKey: null });
    expect(out.status).toBe("partial");
    expect(out.successes).toBe(1);
    expect(out.failures).toBe(1);
    expect(repo.history).toHaveLength(2);
    const good = repo.history.find((h) => h.product_source_id === ok.id)!;
    const bad = repo.history.find((h) => h.product_source_id === broken.id)!;
    expect(good.price).toBe(500);
    expect(bad.price).toBeNull();
    expect(bad.collection_status).toBe("temporary_failure");
    expect(repo.sources.find((s) => s.id === broken.id)!.last_success_at).toBeNull();
    expect(repo.runs[0]!.status).toBe("partial");
    expect(repo.runs[0]!.error_summary).toContain("Monitor");
  });

  it("falha não apaga nem substitui o último preço válido", async () => {
    const { repo, broken, ctx } = setup();
    repo.history.push(makePrice(broken.id, 900, "2026-10-01T11:00:00Z"));
    repo.sources.find((s) => s.id === broken.id)!.last_success_at = "2026-10-01T11:00:00Z";
    await runCollection({ repo, ctx, logger, trigger: "manual", runKey: null });
    const valid = repo.history.filter((h) => h.product_source_id === broken.id && h.collection_status === "success");
    expect(valid).toHaveLength(1);
    expect(valid[0]!.price).toBe(900);
    expect(repo.sources.find((s) => s.id === broken.id)!.last_success_at).toBe("2026-10-01T11:00:00Z");
  });

  it("produtos arquivados não são coletados", async () => {
    const { repo, ignored, ctx, m } = setup();
    await runCollection({ repo, ctx, logger, trigger: "manual", runKey: null });
    expect(repo.history.some((h) => h.product_source_id === ignored.id)).toBe(false);
    expect(m.calls.some((c) => c.url.includes("MLB1000000003"))).toBe(false);
  });

  it("a mesma chave diária não executa duas vezes (idempotência)", async () => {
    const { repo, ctx } = setup();
    await runCollection({ repo, ctx, logger, trigger: "schedule", runKey: "schedule:2026-10-27" });
    const second = await runCollection({ repo, ctx, logger, trigger: "schedule", runKey: "schedule:2026-10-27" });
    expect(second.skipped).toBe(true);
    expect(repo.runs).toHaveLength(1);
    expect(repo.history).toHaveLength(2);
  });

  it("registro duplicado da mesma fonte na mesma execução é recusado", async () => {
    const repo = new MemoryRepository();
    const rec = { ...makePrice("s1", 10, "2026-10-01T00:00:00Z"), run_id: "r1" };
    expect(await repo.insertPrice(rec)).toBe("inserted");
    expect(await repo.insertPrice(rec)).toBe("duplicate");
  });

  it("status final da execução", () => {
    expect(decideRunStatus(3, 0)).toBe("success");
    expect(decideRunStatus(2, 1)).toBe("partial");
    expect(decideRunStatus(0, 3)).toBe("failed");
    expect(decideRunStatus(0, 0)).toBe("success");
  });

  it("erro do banco ao listar fontes marca a execução como falha", async () => {
    const { repo, ctx } = setup();
    repo.listCollectableSources = async () => { throw new Error("db down"); };
    const out = await runCollection({ repo, ctx, logger, trigger: "manual", runKey: null });
    expect(out.status).toBe("failed");
    expect(repo.runs[0]!.status).toBe("failed");
  });
});
