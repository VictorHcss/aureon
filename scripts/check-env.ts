/** Mostra quais variáveis estão configuradas (sem exibir valores). */
import { readEnv } from "../src/lib/env";

const env = readEnv();
const groups: Record<string, (keyof typeof env)[]> = {
  "Banco (obrigatório)": ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
  "Painel (obrigatório)": ["ADMIN_PASSWORD", "SESSION_SECRET"],
  "Mercado Livre (obrigatório para coletar)": ["ML_CLIENT_ID", "ML_CLIENT_SECRET", "ML_REDIRECT_URI"],
  "E-mail (Resend)": ["RESEND_API_KEY", "EMAIL_FROM", "REPORT_EMAIL_TO"],
  Telegram: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"],
  "WhatsApp (opcional)": ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_TO", "WHATSAPP_TEMPLATE_NAME"],
};
for (const [group, keys] of Object.entries(groups)) {
  console.log(`\n${group}`);
  for (const k of keys) console.log(`  ${env[k] ? "✔" : "✘"} ${k}`);
}
if (env.SESSION_SECRET && env.SESSION_SECRET.length < 32) console.log("\n⚠ SESSION_SECRET deve ter pelo menos 32 caracteres.");
