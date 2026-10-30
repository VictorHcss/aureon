/**
 * Gerenciamento do token OAuth do Mercado Livre.
 *
 * O refresh_token do Mercado Livre é de uso único: a cada renovação,
 * um novo refresh_token é emitido. Por isso o token é persistido no banco
 * (tabela integration_tokens) e não apenas em variável de ambiente.
 */
import { z } from "zod";
import { errorMessage, type Logger } from "../logger";
import { ML_API_BASE } from "./mercadolivre";

export interface StoredToken {
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
}

export interface TokenStore {
  getToken(provider: string): Promise<StoredToken | null>;
  saveToken(provider: string, token: StoredToken): Promise<void>;
}

export interface MlAuthEnv {
  ML_CLIENT_ID?: string;
  ML_CLIENT_SECRET?: string;
  ML_REFRESH_TOKEN?: string;
  ML_ACCESS_TOKEN?: string;
  ML_REDIRECT_URI?: string;
}

const TokenResponse = z.object({
  access_token: z.string().min(10),
  refresh_token: z.string().optional(),
  expires_in: z.number().optional(),
});

const PROVIDER = "mercadolivre";

async function postToken(fetchFn: typeof fetch, body: Record<string, string>) {
  const res = await fetchFn(`${ML_API_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(body).toString(),
  });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (json as { message?: string; error?: string } | null)?.message ?? `HTTP ${res.status}`;
    throw new Error(`Falha ao obter token do Mercado Livre: ${msg}`);
  }
  const parsed = TokenResponse.safeParse(json);
  if (!parsed.success) throw new Error("Resposta de token do Mercado Livre em formato inesperado.");
  return parsed.data;
}

export function createMlTokenProvider(opts: {
  env: MlAuthEnv;
  store: TokenStore | null;
  fetch: typeof fetch;
  logger: Logger;
  now?: () => Date;
}) {
  const now = opts.now ?? (() => new Date());
  let cached: StoredToken | null = null;
  let invalidated = false;

  async function getAccessToken(): Promise<string | null> {
    const { env } = opts;
    if (env.ML_ACCESS_TOKEN) return env.ML_ACCESS_TOKEN;
    if (!env.ML_CLIENT_ID || !env.ML_CLIENT_SECRET) return null;

    if (!cached && opts.store) cached = await opts.store.getToken(PROVIDER);
    const stillValid =
      cached?.access_token &&
      cached.expires_at &&
      new Date(cached.expires_at).getTime() - now().getTime() > 5 * 60_000;
    if (stillValid && !invalidated) return cached!.access_token;

    const refresh = cached?.refresh_token ?? env.ML_REFRESH_TOKEN;
    if (!refresh) {
      opts.logger.warn("Mercado Livre sem refresh_token. Rode `npm run ml:auth` para autorizar.");
      return null;
    }
    try {
      const token = await postToken(opts.fetch, {
        grant_type: "refresh_token",
        client_id: env.ML_CLIENT_ID,
        client_secret: env.ML_CLIENT_SECRET,
        refresh_token: refresh,
      });
      cached = {
        access_token: token.access_token,
        refresh_token: token.refresh_token ?? refresh,
        expires_at: new Date(now().getTime() + (token.expires_in ?? 21_600) * 1000).toISOString(),
      };
      invalidated = false;
      if (opts.store) await opts.store.saveToken(PROVIDER, cached);
      opts.logger.info("Token do Mercado Livre renovado");
      return cached.access_token;
    } catch (error) {
      opts.logger.error("Não foi possível renovar o token do Mercado Livre", { error: errorMessage(error) });
      return null;
    }
  }

  return {
    getAccessToken,
    invalidate: () => {
      invalidated = true;
    },
  };
}

export function buildAuthorizationUrl(clientId: string, redirectUri: string): string {
  const url = new URL("https://auth.mercadolivre.com.br/authorization");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  return url.toString();
}

export async function exchangeAuthorizationCode(opts: {
  fetch: typeof fetch;
  env: Required<Pick<MlAuthEnv, "ML_CLIENT_ID" | "ML_CLIENT_SECRET" | "ML_REDIRECT_URI">>;
  code: string;
  store: TokenStore;
  now?: Date;
}): Promise<StoredToken> {
  const token = await postToken(opts.fetch, {
    grant_type: "authorization_code",
    client_id: opts.env.ML_CLIENT_ID,
    client_secret: opts.env.ML_CLIENT_SECRET,
    code: opts.code,
    redirect_uri: opts.env.ML_REDIRECT_URI,
  });
  const now = opts.now ?? new Date();
  const stored: StoredToken = {
    access_token: token.access_token,
    refresh_token: token.refresh_token ?? null,
    expires_at: new Date(now.getTime() + (token.expires_in ?? 21_600) * 1000).toISOString(),
  };
  await opts.store.saveToken(PROVIDER, stored);
  return stored;
}
