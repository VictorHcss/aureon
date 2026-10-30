/**
 * Leitura centralizada das variáveis de ambiente do servidor.
 * Nenhuma delas usa o prefixo NEXT_PUBLIC_, portanto nunca chegam ao navegador.
 */
import { z } from "zod";

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const EnvSchema = z.object({
  SUPABASE_URL: optional,
  SUPABASE_SERVICE_ROLE_KEY: optional,

  ADMIN_PASSWORD: optional,
  SESSION_SECRET: optional,
  APP_BASE_URL: optional,

  ML_CLIENT_ID: optional,
  ML_CLIENT_SECRET: optional,
  ML_REDIRECT_URI: optional,
  ML_REFRESH_TOKEN: optional,
  ML_ACCESS_TOKEN: optional,
  ML_ZIP_CODE: optional,

  RESEND_API_KEY: optional,
  EMAIL_FROM: optional,
  REPORT_EMAIL_TO: optional,

  TELEGRAM_BOT_TOKEN: optional,
  TELEGRAM_CHAT_ID: optional,

  WHATSAPP_TOKEN: optional,
  WHATSAPP_PHONE_NUMBER_ID: optional,
  WHATSAPP_TO: optional,
  WHATSAPP_TEMPLATE_NAME: optional,
  WHATSAPP_TEMPLATE_LANG: optional,
  WHATSAPP_API_VERSION: optional,

  COLLECTOR_TIMEOUT_MS: optional,
  COLLECTOR_MIN_INTERVAL_MS: optional,
  FAIL_ON_PARTIAL: optional,
});

export type AppEnv = z.infer<typeof EnvSchema>;

export function readEnv(source: Record<string, string | undefined> = process.env): AppEnv {
  return EnvSchema.parse(source);
}

export function requireEnv<K extends keyof AppEnv>(env: AppEnv, keys: K[]): { [P in K]: string } {
  const missing = keys.filter((k) => !env[k]);
  if (missing.length) {
    throw new Error(`Variáveis de ambiente ausentes: ${missing.join(", ")}. Consulte o .env.example.`);
  }
  return Object.fromEntries(keys.map((k) => [k, env[k] as string])) as { [P in K]: string };
}
