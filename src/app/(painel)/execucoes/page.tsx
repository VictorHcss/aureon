import type { Metadata } from "next";
import { IconBell, IconHistory } from "@/components/icons";
import { Badge, EmptyState, ErrorNotice, PageHeader, Section, SetupNotice } from "@/components/ui";
import { formatDateTime } from "@/lib/dates";
import { isSupabaseConfigured } from "@/lib/db/client";
import { listNotificationLogs, listRuns } from "@/lib/db/queries";
import { errorMessage } from "@/lib/logger";

export const metadata: Metadata = { title: "Coletas e envios" };

const RUN_STATUS = {
  success: ["Concluída", "good"],
  partial: ["Com falhas", "warn"],
  failed: ["Falhou", "bad"],
  running: ["Em andamento", "neutral"],
} as const;
const TRIGGER = { schedule: "Agendada", manual: "Manual (GitHub)", panel: "Pelo painel" } as const;
const CHANNEL = { email: "E-mail", telegram: "Telegram", whatsapp: "WhatsApp" } as const;
const KIND = { alert: "Alerta", daily_report: "Relatório diário", test: "Teste" } as const;

export default async function RunsPage() {
  if (!isSupabaseConfigured()) return <SetupNotice />;
  let data;
  try {
    const [runs, logs] = await Promise.all([listRuns(30), listNotificationLogs(50)]);
    data = { runs, logs };
  } catch (e) {
    return <ErrorNotice message={errorMessage(e)} />;
  }
  const { runs, logs } = data;
  return (
    <>
      <PageHeader title="Coletas e envios" description="Cada execução e cada notificação ficam registradas aqui para investigar falhas." />
      <div className="space-y-6">
        <Section title="Execuções de coleta" flush>
          {runs.length ? (
            <>
              <ul className="divide-y divide-line md:hidden">
                {runs.map((r) => {
                  const [label, tone] = RUN_STATUS[r.status];
                  return (
                    <li key={r.id} className="px-4 py-3.5 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{formatDateTime(r.started_at)}</p>
                          <p className="text-xs text-muted">
                            {TRIGGER[r.trigger]}
                            {r.github_run_id ? `, GitHub #${r.github_run_id}` : ""}
                          </p>
                        </div>
                        <Badge tone={tone}>{label}</Badge>
                      </div>
                      <p className="mt-2 text-xs text-muted">
                        <span className="figure text-ink">{r.successes}</span> com sucesso,{" "}
                        <span className={`figure ${r.failures ? "text-up" : "text-ink"}`}>{r.failures}</span> com falha
                      </p>
                      {r.error_summary ? <p className="mt-2 whitespace-pre-line text-xs break-words text-muted">{r.error_summary}</p> : null}
                    </li>
                  );
                })}
              </ul>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead className="border-b border-line bg-sunken text-left text-xs text-muted">
                    <tr>
                      <th scope="col" className="px-5 py-3 font-medium">Início</th>
                      <th scope="col" className="px-3 py-3 font-medium">Origem</th>
                      <th scope="col" className="px-3 py-3 font-medium">Resultado</th>
                      <th scope="col" className="px-3 py-3 text-right font-medium">Sucesso</th>
                      <th scope="col" className="px-3 py-3 text-right font-medium">Falha</th>
                      <th scope="col" className="px-5 py-3 font-medium">Detalhes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {runs.map((r) => {
                      const [label, tone] = RUN_STATUS[r.status];
                      return (
                        <tr key={r.id} className="align-top">
                          <td className="whitespace-nowrap px-5 py-3">{formatDateTime(r.started_at)}<div className="text-xs text-muted">fim: {formatDateTime(r.finished_at)}</div></td>
                          <td className="px-3 py-3">{TRIGGER[r.trigger]}{r.github_run_id ? <div className="text-xs text-muted">GitHub #{r.github_run_id}</div> : null}</td>
                          <td className="px-3 py-3"><Badge tone={tone}>{label}</Badge></td>
                          <td className="figure px-3 py-3 text-right">{r.successes}</td>
                          <td className={`figure px-3 py-3 text-right ${r.failures ? "text-up" : ""}`}>{r.failures}</td>
                          <td className="max-w-md whitespace-pre-line px-5 py-3 text-xs break-words text-muted">{r.error_summary ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="p-4 sm:p-5">
              <EmptyState icon={IconHistory} title="Nenhuma coleta registrada">
                Rode o workflow “Coleta diária” manualmente no GitHub ou use “Consultar agora” em uma oferta.
              </EmptyState>
            </div>
          )}
        </Section>

        <Section title="Notificações" flush>
          {logs.length ? (
            <>
              <ul className="divide-y divide-line md:hidden">
                {logs.map((l) => (
                  <li key={l.id} className="px-4 py-3.5 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">{KIND[l.kind]} por {CHANNEL[l.channel]}</p>
                        {l.product_name ? <p className="text-xs break-words text-muted">{l.product_name}</p> : null}
                        <p className="text-xs text-muted">{formatDateTime(l.created_at)}</p>
                      </div>
                      <NotificationBadge status={l.status} />
                    </div>
                    {l.error_message ? <p className="mt-2 text-xs break-words text-up">{l.error_message}</p> : null}
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead className="border-b border-line bg-sunken text-left text-xs text-muted">
                    <tr>
                      <th scope="col" className="px-5 py-3 font-medium">Quando</th>
                      <th scope="col" className="px-3 py-3 font-medium">Canal</th>
                      <th scope="col" className="px-3 py-3 font-medium">Tipo</th>
                      <th scope="col" className="px-3 py-3 font-medium">Resultado</th>
                      <th scope="col" className="px-5 py-3 font-medium">Detalhe</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {logs.map((l) => (
                      <tr key={l.id} className="align-top">
                        <td className="whitespace-nowrap px-5 py-3">{formatDateTime(l.created_at)}</td>
                        <td className="px-3 py-3">{CHANNEL[l.channel]}</td>
                        <td className="px-3 py-3">{KIND[l.kind]}{l.product_name ? <div className="text-xs text-muted">{l.product_name}</div> : null}</td>
                        <td className="px-3 py-3"><NotificationBadge status={l.status} /></td>
                        <td className="max-w-md px-5 py-3 text-xs break-words text-muted">{l.error_message ?? (l.provider_message_id ? `id ${l.provider_message_id}` : "—")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="p-4 sm:p-5">
              <EmptyState icon={IconBell} title="Nenhuma notificação enviada">
                Ative um canal em Configurações e envie uma mensagem de teste.
              </EmptyState>
            </div>
          )}
        </Section>
      </div>
    </>
  );
}

function NotificationBadge({ status }: { status: "sent" | "failed" | "skipped" }) {
  return (
    <Badge tone={status === "sent" ? "good" : status === "failed" ? "bad" : "neutral"}>
      {status === "sent" ? "Enviada" : status === "failed" ? "Falhou" : "Ignorada"}
    </Badge>
  );
}
