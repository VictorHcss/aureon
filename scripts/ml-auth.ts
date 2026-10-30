/**
 * Autoriza o aplicativo do Mercado Livre e guarda o token no Supabase.
 *
 * 1) npm run ml:auth                 → mostra o link de autorização
 * 2) Abra o link, autorize, copie o parâmetro "code" da URL de retorno
 * 3) npm run ml:auth -- --code=TG-xxxxx   → troca o código por tokens e salva
 * 4) npm run ml:auth -- --test=MLB1234567890 → testa uma consulta à API
 */
import { buildAuthorizationUrl, createMlTokenProvider, exchangeAuthorizationCode } from "../src/lib/collectors/mercadolivre-auth";
import { mercadoLivreCollector } from "../src/lib/collectors/mercadolivre";
import { getServiceClient } from "../src/lib/db/client";
import { createSupabaseRepository } from "../src/lib/db/supabase-repository";
import { readEnv, requireEnv } from "../src/lib/env";
import { createLogger, errorMessage } from "../src/lib/logger";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");

async function main() {
  const env = readEnv();
  const logger = createLogger({ script: "ml-auth" });
  const ml = requireEnv(env, ["ML_CLIENT_ID", "ML_CLIENT_SECRET", "ML_REDIRECT_URI"]);
  const repo = createSupabaseRepository(getServiceClient());

  const code = arg("code");
  const test = arg("test");

  if (code) {
    const token = await exchangeAuthorizationCode({ fetch, env: ml, code, store: repo });
    console.log(`Autorização concluída. Token válido até ${token.expires_at}. O refresh token foi salvo no Supabase.`);
    return;
  }

  if (test) {
    const tokens = createMlTokenProvider({ env, store: repo, fetch, logger });
    const result = await mercadoLivreCollector.collect(
      { url: test, externalId: null },
      { fetch, logger, timeoutMs: 15_000, getAccessToken: tokens.getAccessToken, invalidateToken: tokens.invalidate, zipCode: env.ML_ZIP_CODE ?? null },
    );
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log("Abra este link no navegador e autorize o aplicativo. A página /ml-callback do painel mostra o comando com o código:\n");
  console.log(buildAuthorizationUrl(ml.ML_CLIENT_ID, ml.ML_REDIRECT_URI));
  console.log("\nDepois rode: npm run ml:auth -- --code=COLE_O_CODIGO_AQUI");
}

main().catch((error) => {
  console.error(errorMessage(error));
  process.exit(1);
});
