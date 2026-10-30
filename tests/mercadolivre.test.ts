import { beforeAll, describe, expect, it } from "vitest";
import { extractMercadoLivreId, mercadoLivreCollector } from "@/lib/collectors/mercadolivre";
import { setMinInterval } from "@/lib/collectors/http";
import type { CollectorContext } from "@/lib/collectors/types";
import { createLogger } from "@/lib/logger";
import { json, mockFetch } from "./helpers/memory-repository";

beforeAll(() => setMinInterval(0));

const logger = createLogger({}, true);
function ctx(fetchFn: typeof fetch, extra: Partial<CollectorContext> = {}): CollectorContext {
  return { fetch: fetchFn, logger, timeoutMs: 1000, backoffMs: 0, getAccessToken: async () => "APP_USR-test", ...extra };
}
const item = (over: Record<string, unknown> = {}) => ({
  id: "MLB1234567890", title: "SSD 1TB", price: 399.9, original_price: 499.9, currency_id: "BRL", status: "active",
  available_quantity: 5, seller_id: 42, permalink: "https://produto.mercadolivre.com.br/MLB-1234567890", shipping: { free_shipping: true }, ...over,
});
const input = { url: "https://produto.mercadolivre.com.br/MLB-1234567890-ssd-1tb-_JM", externalId: null };

describe("extração de ID", () => {
  it.each([
    ["https://produto.mercadolivre.com.br/MLB-1234567890-ssd-_JM", "item:MLB1234567890"],
    ["https://www.mercadolivre.com.br/ssd-kingston/p/MLB19876543", "catalog:MLB19876543"],
    ["https://www.mercadolivre.com.br/ssd/p/MLB19876543?wid=MLB1111111111", "item:MLB1111111111"],
    ["MLB1234567", "item:MLB1234567"],
    ["MLB-1234567", "item:MLB1234567"],
    ["https://www.mercadolivre.com.br/ofertas", null],
  ])("%s → %s", (url, expected) => {
    expect(extractMercadoLivreId(url)).toBe(expected);
  });
});

describe("coletor Mercado Livre (respostas simuladas)", () => {
  it("lê preço de anúncio ativo com frete grátis e envia o token", async () => {
    const m = mockFetch([
      [/sale_price/, () => json({}, 404)],
      [/\/items\/MLB1234567890$/, () => json(item())],
    ]);
    const r = await mercadoLivreCollector.collect(input, ctx(m.fetch));
    expect(r.status).toBe("success");
    expect(r.price).toBe(399.9);
    expect(r.originalPrice).toBe(499.9);
    expect(r.shippingPrice).toBe(0);
    expect(r.sellerId).toBe("42");
    const headers = m.calls[0]!.init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer APP_USR-test");
  });

  it("prefere o preço promocional de sale_price", async () => {
    const m = mockFetch([
      [/sale_price/, () => json({ amount: 349.9, regular_amount: 399.9, currency_id: "BRL" })],
      [/\/items\/MLB1234567890$/, () => json(item())],
    ]);
    const r = await mercadoLivreCollector.collect(input, ctx(m.fetch));
    expect(r.price).toBe(349.9);
    expect(r.originalPrice).toBe(399.9);
    expect(r.metadata.price_source).toBe("sale_price");
  });

  it("consulta frete com CEP quando não é grátis", async () => {
    const m = mockFetch([
      [/shipping_options/, () => json({ options: [{ cost: 25.5 }, { cost: 19.9 }] })],
      [/sale_price/, () => json({}, 404)],
      [/\/items\/MLB1234567890$/, () => json(item({ shipping: { free_shipping: false } }))],
    ]);
    const r = await mercadoLivreCollector.collect(input, ctx(m.fetch, { zipCode: "01001000" }));
    expect(r.shippingPrice).toBe(19.9);
  });

  it("frete desconhecido fica null (não zero)", async () => {
    const m = mockFetch([
      [/sale_price/, () => json({}, 404)],
      [/\/items\/MLB1234567890$/, () => json(item({ shipping: { free_shipping: false } }))],
    ]);
    const r = await mercadoLivreCollector.collect(input, ctx(m.fetch));
    expect(r.shippingPrice).toBeNull();
  });

  it("anúncio pausado → indisponível, sem preço", async () => {
    const m = mockFetch([[/\/items\//, () => json(item({ status: "paused" }))]]);
    const r = await mercadoLivreCollector.collect(input, ctx(m.fetch));
    expect(r.status).toBe("unavailable");
    expect(r.price).toBeNull();
    expect(r.availability).toBe("out_of_stock");
  });

  it("404 → indisponível", async () => {
    const m = mockFetch([[/\/items\//, () => json({ message: "not found" }, 404)]]);
    expect((await mercadoLivreCollector.collect(input, ctx(m.fetch))).status).toBe("unavailable");
  });

  it("403 → erro de autenticação", async () => {
    const m = mockFetch([[/\/items\//, () => json({ message: "forbidden" }, 403)]]);
    const r = await mercadoLivreCollector.collect(input, ctx(m.fetch));
    expect(r.status).toBe("auth_error");
    expect(r.price).toBeNull();
  });

  it("401 renova o token uma vez e tenta de novo", async () => {
    let first = true;
    let invalidated = 0;
    const m = mockFetch([
      [/sale_price/, () => json({}, 404)],
      [/\/items\/MLB1234567890$/, () => {
        if (first) { first = false; return json({}, 401); }
        return json(item());
      }],
    ]);
    const r = await mercadoLivreCollector.collect(input, ctx(m.fetch, { invalidateToken: () => invalidated++ }));
    expect(invalidated).toBe(1);
    expect(r.status).toBe("success");
  });

  it("5xx persistente → falha temporária após repetições", async () => {
    const m = mockFetch([[/\/items\//, () => json({}, 503)]]);
    const r = await mercadoLivreCollector.collect(input, ctx(m.fetch));
    expect(r.status).toBe("temporary_failure");
    expect(m.calls.length).toBe(3);
  });

  it("formato inesperado → estrutura alterada", async () => {
    const m = mockFetch([[/\/items\//, () => json({ foo: "bar" })]]);
    expect((await mercadoLivreCollector.collect(input, ctx(m.fetch))).status).toBe("structure_changed");
  });

  it("preço ausente/zero → preço não identificado (nunca R$ 0,00)", async () => {
    const m = mockFetch([
      [/sale_price/, () => json({}, 404)],
      [/\/items\//, () => json(item({ price: 0 }))],
    ]);
    const r = await mercadoLivreCollector.collect(input, ctx(m.fetch));
    expect(r.status).toBe("price_not_found");
    expect(r.price).toBeNull();
  });

  it("moeda diferente de BRL não é aceita como sucesso", async () => {
    const m = mockFetch([
      [/sale_price/, () => json({}, 404)],
      [/\/items\//, () => json(item({ currency_id: "USD" }))],
    ]);
    expect((await mercadoLivreCollector.collect(input, ctx(m.fetch))).status).toBe("structure_changed");
  });

  it("erro de rede → falha temporária", async () => {
    const failing = (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch;
    const r = await mercadoLivreCollector.collect(input, ctx(failing));
    expect(r.status).toBe("temporary_failure");
  });

  it("timeout → falha temporária", async () => {
    const slow = ((_: unknown, init?: RequestInit) =>
      new Promise((_r, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))))) as typeof fetch;
    const r = await mercadoLivreCollector.collect(input, ctx(slow, { timeoutMs: 20 }));
    expect(r.status).toBe("temporary_failure");
    expect(r.error).toContain("Tempo limite");
  });

  it("catálogo usa a oferta vencedora", async () => {
    const m = mockFetch([
      [/\/products\/MLB19876543$/, () => json({ id: "MLB19876543", name: "SSD", status: "active", buy_box_winner: { item_id: "MLB555", price: 289.9, currency_id: "BRL", seller_id: 7, shipping: { free_shipping: true } } })],
    ]);
    const r = await mercadoLivreCollector.collect({ url: "https://www.mercadolivre.com.br/ssd/p/MLB19876543", externalId: null }, ctx(m.fetch));
    expect(r.status).toBe("success");
    expect(r.price).toBe(289.9);
    expect(r.metadata.winning_item_id).toBe("MLB555");
  });

  it("catálogo sem oferta → indisponível", async () => {
    const m = mockFetch([[/\/products\//, () => json({ id: "MLB19876543", buy_box_winner: null })]]);
    const r = await mercadoLivreCollector.collect({ url: "https://www.mercadolivre.com.br/ssd/p/MLB19876543", externalId: null }, ctx(m.fetch));
    expect(r.status).toBe("unavailable");
  });

  it("URL sem código → fonte inválida, sem requisição", async () => {
    const m = mockFetch([]);
    const r = await mercadoLivreCollector.collect({ url: "https://www.mercadolivre.com.br/ofertas", externalId: null }, ctx(m.fetch));
    expect(r.status).toBe("invalid_source");
    expect(m.calls).toHaveLength(0);
  });
});
