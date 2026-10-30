/** Monta os remetentes a partir das configurações do painel + variáveis de ambiente. */
import type { AppEnv } from "../env";
import type { Logger } from "../logger";
import type { NotificationSettings } from "../types";
import { createResendSender } from "./resend";
import { createTelegramSender } from "./telegram";
import type { ChannelSender } from "./types";
import { createWhatsAppSender } from "./whatsapp";

export function buildSenders(env: AppEnv, settings: NotificationSettings, fetchFn: typeof fetch, logger: Logger): ChannelSender[] {
  const senders: ChannelSender[] = [];

  if (settings.email_enabled) {
    const to = (settings.email_to ?? env.REPORT_EMAIL_TO ?? "").split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    if (env.RESEND_API_KEY && env.EMAIL_FROM && to.length) {
      senders.push(createResendSender({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM, to, fetch: fetchFn }));
    } else logger.warn("E-mail habilitado, mas faltam RESEND_API_KEY, EMAIL_FROM ou destinatário.");
  }

  if (settings.telegram_enabled) {
    const chatId = settings.telegram_chat_id ?? env.TELEGRAM_CHAT_ID;
    if (env.TELEGRAM_BOT_TOKEN && chatId) {
      senders.push(createTelegramSender({ token: env.TELEGRAM_BOT_TOKEN, chatId, fetch: fetchFn }));
    } else logger.warn("Telegram habilitado, mas faltam TELEGRAM_BOT_TOKEN ou chat id.");
  }

  if (settings.whatsapp_enabled) {
    const to = settings.whatsapp_to ?? env.WHATSAPP_TO;
    if (env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID && to && env.WHATSAPP_TEMPLATE_NAME) {
      senders.push(
        createWhatsAppSender({
          token: env.WHATSAPP_TOKEN,
          phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
          to,
          templateName: env.WHATSAPP_TEMPLATE_NAME,
          templateLang: env.WHATSAPP_TEMPLATE_LANG ?? "pt_BR",
          apiVersion: env.WHATSAPP_API_VERSION ?? "v23.0",
          fetch: fetchFn,
        }),
      );
    } else logger.warn("WhatsApp habilitado, mas faltam credenciais, destino ou nome do modelo.");
  }
  return senders;
}
