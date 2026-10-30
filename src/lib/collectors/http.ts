/** Cliente HTTP com timeout, repetição limitada e intervalo mínimo entre requisições. */

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Tempo limite de ${ms} ms excedido`);
    this.name = "TimeoutError";
  }
}

export interface RequestOptions {
  fetch: typeof fetch;
  timeoutMs: number;
  retries?: number;
  headers?: Record<string, string>;
  method?: string;
  body?: string;
  /** Atraso base entre tentativas (ms). Testes usam 0. */
  backoffMs?: number;
}

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);
const lastRequestAt = new Map<string, number>();
let minIntervalMs = 400;

/** Intervalo mínimo entre requisições ao mesmo host (limite de taxa). */
export function setMinInterval(ms: number) {
  minIntervalMs = ms;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function throttle(host: string) {
  const last = lastRequestAt.get(host) ?? 0;
  const wait = last + minIntervalMs - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt.set(host, Date.now());
}

export interface JsonResponse<T> {
  status: number;
  data: T | null;
}

/**
 * Faz uma requisição e devolve status + JSON. Respostas 4xx não repetíveis
 * são devolvidas para o coletor interpretar; falhas de rede, timeout
 * e 429/5xx são repetidas até `retries` vezes e depois lançam erro.
 */
export async function requestJson<T>(url: string, opts: RequestOptions): Promise<JsonResponse<T>> {
  const retries = opts.retries ?? 2;
  const backoff = opts.backoffMs ?? 800;
  const host = new URL(url).host;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0 && backoff > 0) await sleep(backoff * 2 ** (attempt - 1));
    await throttle(host);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
    try {
      const res = await opts.fetch(url, {
        method: opts.method ?? "GET",
        headers: { Accept: "application/json", ...opts.headers },
        body: opts.body,
        signal: controller.signal,
        redirect: "error",
      });
      if (RETRYABLE.has(res.status) && attempt < retries) {
        lastError = new Error(`HTTP ${res.status}`);
        continue;
      }
      const text = await res.text();
      let data: T | null = null;
      if (text) {
        try {
          data = JSON.parse(text) as T;
        } catch {
          data = null;
        }
      }
      return { status: res.status, data };
    } catch (error) {
      lastError = controller.signal.aborted ? new TimeoutError(opts.timeoutMs) : error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
