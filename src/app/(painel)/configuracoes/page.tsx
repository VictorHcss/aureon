import type { Metadata } from "next";
import { sendTest } from "@/app/actions";
import { RunAction } from "@/components/action-buttons";
import { IconCheck, IconCircle } from "@/components/icons";
import { CategoryForm, SettingsForm } from "@/components/forms";
import { Badge, ErrorNotice, PageHeader, Section, SetupNotice } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/db/client";
import { getSettings, listCategories } from "@/lib/db/queries";
import { readEnv } from "@/lib/env";
import { errorMessage } from "@/lib/logger";

export const metadata: Metadata = { title: "Configurações" };
/** Os testes de envio chamam APIs externas (Resend, Telegram, Meta); 60 s de folga. */
export const maxDuration = 60;

export default async function SettingsPage() {
  if (!isSupabaseConfigured()) return <SetupNotice />;
  let data;
  try {
    const [settings, categories] = await Promise.all([getSettings(), listCategories()]);
    data = { settings, categories };
  } catch (e) {
    return <ErrorNotice message={errorMessage(e)} />;
  }
  const env = readEnv();
  const checks: [string, boolean, string][] = [
    ["Mercado Livre", Boolean(env.ML_ACCESS_TOKEN || (env.ML_CLIENT_ID && env.ML_CLIENT_SECRET)), "ML_CLIENT_ID e ML_CLIENT_SECRET (depois rode npm run ml:auth)"],
    ["E-mail (Resend)", Boolean(env.RESEND_API_KEY && env.EMAIL_FROM), "RESEND_API_KEY e EMAIL_FROM"],
    ["Telegram", Boolean(env.TELEGRAM_BOT_TOKEN), "TELEGRAM_BOT_TOKEN"],
    ["WhatsApp", Boolean(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_TEMPLATE_NAME), "WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID e WHATSAPP_TEMPLATE_NAME"],
  ];

  return (
    <>
      <PageHeader title="Configurações" description="Canais de notificação, o que enviar e categorias. Credenciais ficam só nas variáveis de ambiente." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Section title="Notificações">
          <SettingsForm settings={data.settings} />
        </Section>
        <div className="min-w-0 space-y-6">
          <Section title="Credenciais deste servidor">
            <ul className="space-y-3 text-sm">
              {checks.map(([name, ok, hint]) => (
                <li key={name} className="flex gap-2.5">
                  <span className={`mt-0.5 ${ok ? "text-down" : "text-warn"}`}>{ok ? <IconCheck size={16} /> : <IconCircle size={16} />}</span>
                  <span>
                    <span className="font-medium">{name}</span>
                    <span className="sr-only">{ok ? ": configurado" : ": não configurado"}</span>
                    {!ok ? <span className="block text-xs text-muted">Defina {hint}.</span> : null}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">
              Estas são as variáveis do painel (Vercel). A coleta diária usa os segredos do GitHub Actions, configurados à parte.
            </p>
          </Section>
          <Section title="Enviar mensagem de teste">
            <p className="mb-3 text-xs text-muted">Salve as configurações antes. O teste usa o destino salvo acima.</p>
            <div className="flex flex-col items-start gap-2.5">
              <RunAction action={sendTest.bind(null, "email")} label="Testar e-mail" pendingLabel="Enviando…" />
              <RunAction action={sendTest.bind(null, "telegram")} label="Testar Telegram" pendingLabel="Enviando…" />
              <RunAction action={sendTest.bind(null, "whatsapp")} label="Testar WhatsApp" pendingLabel="Enviando…" />
            </div>
          </Section>
          <Section title="Agendamento">
            <p className="text-sm">
              Coleta, alertas e relatório rodam todos os dias às 8h (horário de Brasília) pelo GitHub Actions. O GitHub pode atrasar
              o início em alguns minutos.
            </p>
          </Section>
          <Section title="Categorias">
            <ul className="mb-4 flex flex-wrap gap-1.5">
              {data.categories.map((c) => (
                <li key={c.id}>
                  <Badge>{c.name}</Badge>
                </li>
              ))}
            </ul>
            <CategoryForm />
          </Section>
        </div>
      </div>
    </>
  );
}
