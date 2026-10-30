/**
 * Validação de URLs aceitas pelos coletores (proteção contra SSRF).
 * Só domínios explicitamente permitidos são aceitos; a coleta em si
 * usa as APIs oficiais e nunca faz requisições para a URL do usuário.
 */
import type { SourceType } from "./types";

const ALLOWED_HOSTS: Record<SourceType, string[]> = {
  mercadolivre: ["mercadolivre.com.br"],
};

export interface UrlCheck {
  ok: boolean;
  url?: URL;
  sourceType?: SourceType;
  reason?: string;
}

function hostMatches(host: string, allowed: string): boolean {
  return host === allowed || host.endsWith(`.${allowed}`);
}

export function checkProductUrl(raw: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "URL inválida." };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "Use um endereço que comece com https://." };
  if (url.username || url.password) return { ok: false, reason: "A URL não pode conter usuário ou senha." };
  if (url.port) return { ok: false, reason: "A URL não pode indicar porta." };
  const host = url.hostname.toLowerCase();
  for (const [type, hosts] of Object.entries(ALLOWED_HOSTS) as [SourceType, string[]][]) {
    if (hosts.some((h) => hostMatches(host, h))) return { ok: true, url, sourceType: type };
  }
  return {
    ok: false,
    reason: "Loja não suportada. No momento, aceitamos links do Mercado Livre (mercadolivre.com.br).",
  };
}
