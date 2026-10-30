import type { AvailabilityStatus, CollectionStatus, SourceType } from "../types";
import type { Logger } from "../logger";

export interface CollectorInput {
  url: string;
  externalId: string | null;
}

export interface CollectorResult {
  status: CollectionStatus;
  price: number | null;
  originalPrice: number | null;
  shippingPrice: number | null;
  currency: string;
  availability: AvailabilityStatus;
  sellerId: string | null;
  title: string | null;
  permalink: string | null;
  /** Mensagem técnica sem segredos, para o log e o painel. */
  error: string | null;
  metadata: Record<string, unknown>;
}

export interface CollectorContext {
  fetch: typeof fetch;
  logger: Logger;
  timeoutMs: number;
  /** Retorna um token de acesso válido, ou null se não houver credenciais. */
  getAccessToken: () => Promise<string | null>;
  /** Invalida o token atual (ex.: após 401) para forçar renovação. */
  invalidateToken?: () => void;
  /** CEP opcional para consultar o frete. */
  zipCode?: string | null;
  /** Atraso entre tentativas (testes usam 0). */
  backoffMs?: number;
}

export interface Collector {
  type: SourceType;
  label: string;
  /** Extrai o identificador externo (ex.: MLB123) a partir da URL. */
  extractId(url: string): string | null;
  collect(input: CollectorInput, ctx: CollectorContext): Promise<CollectorResult>;
}

export function emptyResult(
  status: CollectionStatus,
  error: string | null,
  extra: Partial<CollectorResult> = {},
): CollectorResult {
  return {
    status,
    price: null,
    originalPrice: null,
    shippingPrice: null,
    currency: "BRL",
    availability: "unknown",
    sellerId: null,
    title: null,
    permalink: null,
    error,
    metadata: {},
    ...extra,
  };
}
