/**
 * Coletor do Mercado Livre via API oficial (https://api.mercadolibre.com).
 *
 * Suporta:
 *  - Anúncios: produto.mercadolivre.com.br/MLB-123456789-...  → GET /items/MLB123456789
 *  - Páginas de catálogo: www.mercadolivre.com.br/.../p/MLB123 → GET /products/MLB123 (oferta vencedora)
 *    Se a URL de catálogo tiver ?wid=MLB... (anúncio específico), o anúncio é usado.
 *
 * Nunca acessa a página HTML; a URL do usuário serve apenas para extrair o ID.
 */
import { z } from "zod";
import { isValidPrice, roundMoney } from "../money";
import { errorMessage } from "../logger";
import { requestJson } from "./http";
import { emptyResult, type Collector, type CollectorContext, type CollectorInput, type CollectorResult } from "./types";

export const ML_API_BASE = "https://api.mercadolibre.com";

const ITEM_PREFIX = "item:";
const CATALOG_PREFIX = "catalog:";

export function extractMercadoLivreId(raw: string): string | null {
  const text = raw.trim();
  // ID puro digitado pelo usuário
  const bare = /^MLB-?(\d{6,})$/i.exec(text);
  if (bare) return `${ITEM_PREFIX}MLB${bare[1]}`;

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  const wid = url.searchParams.get("wid") ?? url.searchParams.get("item_id");
  if (wid && /^MLB\d{6,}$/i.test(wid)) return `${ITEM_PREFIX}${wid.toUpperCase()}`;

  const catalog = /\/p\/(MLB\d{5,})/i.exec(url.pathname);
  if (catalog) return `${CATALOG_PREFIX}${catalog[1]!.toUpperCase()}`;

  const item = /(?:^|\/)MLB-?(\d{6,})/i.exec(url.pathname);
  if (item) return `${ITEM_PREFIX}MLB${item[1]}`;
  return null;
}

const ItemSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  price: z.number().nullable().optional(),
  original_price: z.number().nullable().optional(),
  currency_id: z.string().nullable().optional(),
  status: z.string().optional(),
  sub_status: z.array(z.string()).optional(),
  available_quantity: z.number().nullable().optional(),
  seller_id: z.number().nullable().optional(),
  permalink: z.string().nullable().optional(),
  shipping: z.object({ free_shipping: z.boolean().optional() }).nullable().optional(),
});

const SalePriceSchema = z.object({
  amount: z.number().nullable().optional(),
  regular_amount: z.number().nullable().optional(),
  currency_id: z.string().nullable().optional(),
});

const ProductSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  status: z.string().optional(),
  permalink: z.string().nullable().optional(),
  buy_box_winner: z
    .object({
      item_id: z.string().optional(),
      price: z.number().nullable().optional(),
      original_price: z.number().nullable().optional(),
      currency_id: z.string().nullable().optional(),
      seller_id: z.number().nullable().optional(),
      shipping: z.object({ free_shipping: z.boolean().optional() }).nullable().optional(),
    })
    .nullable()
    .optional(),
});

const ShippingOptionsSchema = z.object({
  options: z.array(z.object({ cost: z.number().nullable().optional(), list_cost: z.number().nullable().optional() })).optional(),
});

interface ApiCall {
  status: number;
  data: unknown;
}

async function callApi(path: string, ctx: CollectorContext): Promise<ApiCall> {
  const doCall = async () => {
    const token = await ctx.getAccessToken();
    return requestJson<unknown>(`${ML_API_BASE}${path}`, {
      fetch: ctx.fetch,
      timeoutMs: ctx.timeoutMs,
      backoffMs: ctx.backoffMs,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  };
  let res = await doCall();
  if (res.status === 401 && ctx.invalidateToken) {
    // Token expirado ou revogado: renova uma única vez.
    ctx.invalidateToken();
    res = await doCall();
  }
  return res;
}

function httpFailure(status: number, what: string): CollectorResult {
  if (status === 404) return emptyResult("unavailable", `${what} não encontrado (HTTP 404).`, { availability: "out_of_stock" });
  if (status === 401 || status === 403)
    return emptyResult(
      "auth_error",
      `A API do Mercado Livre recusou o acesso (HTTP ${status}). Verifique as credenciais (npm run ml:auth).`,
    );
  if (status === 429 || status >= 500) return emptyResult("temporary_failure", `Falha temporária na API (HTTP ${status}).`);
  return emptyResult("invalid_source", `Resposta inesperada da API (HTTP ${status}).`);
}

async function fetchShipping(itemId: string, ctx: CollectorContext): Promise<number | null> {
  if (!ctx.zipCode) return null;
  try {
    const res = await callApi(`/items/${itemId}/shipping_options?zip_code=${encodeURIComponent(ctx.zipCode)}`, ctx);
    if (res.status !== 200) return null;
    const parsed = ShippingOptionsSchema.safeParse(res.data);
    if (!parsed.success || !parsed.data.options?.length) return null;
    const costs = parsed.data.options.map((o) => o.cost).filter((c): c is number => typeof c === "number" && c >= 0);
    return costs.length ? roundMoney(Math.min(...costs)) : null;
  } catch (error) {
    ctx.logger.warn("Frete não consultado", { itemId, error: errorMessage(error) });
    return null;
  }
}

async function fetchSalePrice(itemId: string, ctx: CollectorContext) {
  try {
    const res = await callApi(`/items/${itemId}/sale_price?context=channel_marketplace`, ctx);
    if (res.status !== 200) return null;
    const parsed = SalePriceSchema.safeParse(res.data);
    if (!parsed.success || !isValidPrice(parsed.data.amount)) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

async function collectItem(itemId: string, ctx: CollectorContext): Promise<CollectorResult> {
  const res = await callApi(`/items/${itemId}`, ctx);
  if (res.status !== 200) return httpFailure(res.status, "Anúncio");
  const parsed = ItemSchema.safeParse(res.data);
  if (!parsed.success) return emptyResult("structure_changed", "A resposta da API mudou de formato (anúncio).");
  const item = parsed.data;
  const base = {
    title: item.title ?? null,
    permalink: item.permalink ?? null,
    sellerId: item.seller_id != null ? String(item.seller_id) : null,
  };

  if (item.status !== "active" || item.available_quantity === 0) {
    return emptyResult("unavailable", `Anúncio sem estoque ou ${item.status ?? "inativo"}.`, {
      ...base,
      availability: "out_of_stock",
      metadata: { ml_status: item.status ?? null, sub_status: item.sub_status ?? [], last_seen_price: item.price ?? null },
    });
  }

  const sale = await fetchSalePrice(itemId, ctx);
  const price = sale?.amount ?? item.price;
  const currency = sale?.currency_id ?? item.currency_id ?? null;
  if (!isValidPrice(price)) return emptyResult("price_not_found", "Anúncio ativo sem preço identificável.", base);
  if (currency !== "BRL")
    return emptyResult("structure_changed", `Moeda inesperada: ${currency ?? "não informada"}.`, base);

  const original = sale?.regular_amount ?? item.original_price ?? null;
  const shipping = item.shipping?.free_shipping ? 0 : await fetchShipping(itemId, ctx);
  return {
    status: "success",
    price: roundMoney(price),
    originalPrice: isValidPrice(original) && original > price ? roundMoney(original) : null,
    shippingPrice: shipping,
    currency: "BRL",
    availability: "in_stock",
    ...base,
    error: null,
    metadata: {
      price_source: sale ? "sale_price" : "item.price",
      free_shipping: item.shipping?.free_shipping ?? null,
      available_quantity: item.available_quantity ?? null,
    },
  };
}

async function collectCatalog(productId: string, ctx: CollectorContext): Promise<CollectorResult> {
  const res = await callApi(`/products/${productId}`, ctx);
  if (res.status !== 200) return httpFailure(res.status, "Produto de catálogo");
  const parsed = ProductSchema.safeParse(res.data);
  if (!parsed.success) return emptyResult("structure_changed", "A resposta da API mudou de formato (catálogo).");
  const product = parsed.data;
  const winner = product.buy_box_winner;
  const base = { title: product.name ?? null, permalink: product.permalink ?? null };
  if (!winner || product.status === "inactive") {
    return emptyResult("unavailable", "Nenhuma oferta ativa no catálogo no momento.", {
      ...base,
      availability: "out_of_stock",
    });
  }
  if (!isValidPrice(winner.price)) return emptyResult("price_not_found", "Oferta do catálogo sem preço identificável.", base);
  if (winner.currency_id !== "BRL")
    return emptyResult("structure_changed", `Moeda inesperada: ${winner.currency_id ?? "não informada"}.`, base);

  const shipping = winner.shipping?.free_shipping
    ? 0
    : winner.item_id
      ? await fetchShipping(winner.item_id, ctx)
      : null;
  return {
    status: "success",
    price: roundMoney(winner.price),
    originalPrice:
      isValidPrice(winner.original_price) && winner.original_price > winner.price ? roundMoney(winner.original_price) : null,
    shippingPrice: shipping,
    currency: "BRL",
    availability: "in_stock",
    sellerId: winner.seller_id != null ? String(winner.seller_id) : null,
    ...base,
    error: null,
    metadata: {
      price_source: "buy_box_winner",
      winning_item_id: winner.item_id ?? null,
      note: "Oferta vencedora do catálogo; o vendedor pode mudar entre coletas.",
    },
  };
}

export const mercadoLivreCollector: Collector = {
  type: "mercadolivre",
  label: "Mercado Livre",
  extractId: extractMercadoLivreId,
  async collect(input: CollectorInput, ctx: CollectorContext): Promise<CollectorResult> {
    const id = input.externalId ?? extractMercadoLivreId(input.url);
    if (!id) return emptyResult("invalid_source", "Não foi possível identificar o código MLB na URL.");
    try {
      if (id.startsWith(CATALOG_PREFIX)) return await collectCatalog(id.slice(CATALOG_PREFIX.length), ctx);
      if (id.startsWith(ITEM_PREFIX)) return await collectItem(id.slice(ITEM_PREFIX.length), ctx);
      return emptyResult("invalid_source", `Identificador desconhecido: ${id}`);
    } catch (error) {
      return emptyResult("temporary_failure", `Erro de rede ou tempo limite: ${errorMessage(error)}`);
    }
  },
};
