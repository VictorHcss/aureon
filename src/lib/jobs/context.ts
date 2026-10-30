/** Monta as dependências reais (Supabase, Mercado Livre, canais) a partir do ambiente. */
import { createMlTokenProvider } from "../collectors/mercadolivre-auth";
import { setMinInterval } from "../collectors/http";
import type { CollectorContext } from "../collectors/types";
import { getServiceClient } from "../db/client";
import { createSupabaseRepository } from "../db/supabase-repository";
import type { Repository } from "../db/repository";
import { readEnv, type AppEnv } from "../env";
import type { Logger } from "../logger";

export function createJobContext(logger: Logger, envOverride?: AppEnv) {
  const env = envOverride ?? readEnv();
  const repo: Repository = createSupabaseRepository(getServiceClient());
  const tokens = createMlTokenProvider({ env, store: repo, fetch, logger });
  setMinInterval(Number(env.COLLECTOR_MIN_INTERVAL_MS ?? 400));
  const collectorCtx: Omit<CollectorContext, "logger"> = {
    fetch,
    timeoutMs: Number(env.COLLECTOR_TIMEOUT_MS ?? 15_000),
    getAccessToken: tokens.getAccessToken,
    invalidateToken: tokens.invalidate,
    zipCode: env.ML_ZIP_CODE ?? null,
  };
  return { env, repo, collectorCtx };
}
