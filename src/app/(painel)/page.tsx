import Link from "next/link";
import { IconAlert, IconBox, IconPlus, IconTag, IconTarget, IconTrendDown } from "@/components/icons";
import { ProductChartPicker } from "@/components/price-chart-lazy";
import {
  Badge, ButtonLink, Change, EmptyState, ErrorNotice, ExternalLink, Money, PageHeader, Section, SetupNotice, StatCard, StatusBadge,
} from "@/components/ui";
import { summarizeDashboard } from "@/lib/dashboard";
import { formatDateTime } from "@/lib/dates";
import { isSupabaseConfigured } from "@/lib/db/client";
import { getLastSuccessfulRun, listRecentAlerts, listRuns, loadProductViews } from "@/lib/db/queries";
import { errorMessage } from "@/lib/logger";
import { RULE_LABELS } from "@/lib/types";

const RUN_INFO = {
  success: ["Concluída", "good"],
  partial: ["Com falhas", "warn"],
  failed: ["Falhou", "bad"],
  running: ["Em andamento", "neutral"],
} as const;

export default async function Dashboard() {
  if (!isSupabaseConfigured()) return <SetupNotice />;
  let data;
  try {
    const [views, runs, lastOk, alerts] = await Promise.all([loadProductViews(), listRuns(1), getLastSuccessfulRun(), listRecentAlerts(8)]);
    data = { views, lastRun: runs[0] ?? null, lastOk, alerts };
  } catch (e) {
    return <ErrorNotice message={errorMessage(e)} />;
  }
  const { views, lastRun, lastOk, alerts } = data;

  if (!views.length) {
    return (
      <>
        <PageHeader title="Visão geral" description="O resumo dos seus produtos monitorados aparece aqui." />
        <EmptyState
          icon={IconTag}
          title="Nenhum produto cadastrado ainda"
          action={
            <ButtonLink href="/produtos/novo">
              <IconPlus size={16} /> Cadastrar o primeiro produto
            </ButtonLink>
          }
        >
          Cadastre um produto, cole o link do anúncio no Mercado Livre e clique em “Consultar agora”. A partir da primeira coleta, o
          Aureon passa a montar o histórico, os gráficos e o relatório diário.
        </EmptyState>
      </>
    );
  }

  const s = summarizeDashboard(views);
  const runInfo = lastRun ? RUN_INFO[lastRun.status] : null;

  return (
    <>
      <PageHeader
        title="Visão geral"
        description="Comparações consideram apenas as lojas que o Aureon consulta."
        actions={
          <ButtonLink href="/produtos/novo">
            <IconPlus size={16} /> Novo produto
          </ButtonLink>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Monitorados"
          value={s.monitored.length}
          icon={IconBox}
          href="/produtos?status=ativos"
          hint={`${s.activeOffers} ${s.activeOffers === 1 ? "oferta ativa" : "ofertas ativas"} em ${s.stores} ${s.stores === 1 ? "loja" : "lojas"}`}
        />
        <StatCard
          label="Em queda"
          value={s.drops.length}
          icon={IconTrendDown}
          tone={s.drops.length ? "good" : "neutral"}
          hint={s.rises.length ? `${s.rises.length} em alta desde a coleta anterior` : "Nenhuma oferta subiu de preço"}
        />
        <StatCard
          label="No preço-alvo"
          value={s.onTarget.length}
          icon={IconTarget}
          tone={s.onTarget.length ? "good" : "neutral"}
          href="/produtos?status=alvo"
          hint={s.withTarget ? `de ${s.withTarget} com alvo definido` : "Nenhum produto tem alvo definido"}
        />
        <StatCard
          label="Precisam de atenção"
          value={s.attention.length}
          icon={IconAlert}
          tone={s.attention.length ? "warn" : "neutral"}
          hint={s.attention.length ? "Falha na coleta ou sem atualização" : "Tudo atualizado sem falhas"}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <Section title="Oportunidades de compra" aside={<span className="text-xs text-muted">menor preço entre as lojas monitoradas</span>} flush>
            {s.opportunities.length ? (
              <ul className="divide-y divide-line">
                {s.opportunities.map((v) => (
                  <li key={v.product.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_7rem_6rem_7rem] sm:items-center sm:px-5">
                    <div className="min-w-0">
                      <Link href={`/produtos/${v.product.id}`} className="font-medium break-words hover:underline">
                        {v.product.name}
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        <ExternalLink href={v.best!.source.product_url}>{v.best!.source.store_name}</ExternalLink>
                        {v.reachedTarget ? <Badge tone="good">no alvo</Badge> : null}
                        {v.best!.stats.isHistoricLow ? <Badge tone="accent">menor já observado</Badge> : null}
                      </div>
                    </div>
                    <div className="text-right sm:order-none">
                      <Money value={v.best!.stats.latest!.price} className="font-semibold" />
                      <div className="sm:hidden">
                        <Change pct={v.best!.stats.pctChange} abs={v.best!.stats.absChange} />
                      </div>
                    </div>
                    <div className="hidden text-right sm:block">
                      <Change pct={v.best!.stats.pctChange} abs={v.best!.stats.absChange} />
                    </div>
                    <div className="hidden text-right text-sm text-muted sm:block">
                      <span className="sr-only">Alvo: </span>
                      <Money value={v.product.target_price} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-sm text-muted sm:px-5">Nenhuma queda ou preço-alvo atingido nas coletas mais recentes.</p>
            )}
          </Section>

          <Section title="Evolução dos preços">
            {s.chartOptions.length ? (
              <ProductChartPicker options={s.chartOptions} />
            ) : (
              <p className="text-sm text-muted">Os gráficos aparecem depois da primeira coleta com sucesso.</p>
            )}
          </Section>
        </div>

        <div className="min-w-0 space-y-6">
          <Section title="Última coleta" aside={runInfo ? <Badge tone={runInfo[1]}>{runInfo[0]}</Badge> : null}>
            {lastRun ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div className="col-span-2">
                  <dt className="text-xs text-muted">Iniciada em</dt>
                  <dd className="font-medium">{formatDateTime(lastRun.started_at)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Consultas com sucesso</dt>
                  <dd className="figure font-medium">{lastRun.successes}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Com falha</dt>
                  <dd className={`figure font-medium ${lastRun.failures ? "text-up" : ""}`}>{lastRun.failures}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-muted">Última atualização bem-sucedida</dt>
                  <dd className="font-medium">{formatDateTime(lastOk?.finished_at ?? null)}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-muted">Nenhuma coleta registrada. Use “Consultar agora” em uma oferta ou rode o workflow diário.</p>
            )}
            <Link href="/execucoes" className="mt-4 inline-flex min-h-9 items-center text-sm font-medium text-link hover:underline">
              Ver histórico de coletas
            </Link>
          </Section>

          <Section title="Precisa de atenção">
            {s.attention.length ? (
              <ul className="space-y-3 text-sm">
                {s.attention.map((v) => {
                  const failing = v.sources.find((x) => x.source.active && x.source.last_status && x.source.last_status !== "success");
                  return (
                    <li key={v.product.id}>
                      <Link href={`/produtos/${v.product.id}`} className="font-medium break-words hover:underline">
                        {v.product.name}
                      </Link>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {failing ? <StatusBadge status={failing.source.last_status} /> : null}
                        {v.stale ? <Badge tone="warn">desatualizado</Badge> : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted">Todas as ofertas foram atualizadas sem falhas.</p>
            )}
          </Section>

          <Section title="Alertas recentes">
            {alerts.length ? (
              <ol className="relative space-y-4 border-l border-line pl-4 text-sm">
                {alerts.map((a) => (
                  <li key={a.id} className="relative">
                    <span aria-hidden="true" className="absolute top-1.5 -left-[1.31rem] size-2 rounded-full bg-accent" />
                    <p className="font-medium break-words">{a.product_name ?? "Produto removido"}</p>
                    <p className="text-xs text-muted">{RULE_LABELS[a.rule_type]}</p>
                    <p className="text-xs text-muted">
                      <time dateTime={a.created_at}>{formatDateTime(a.created_at)}</time>
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted">Nenhum alerta disparado. Crie regras na página de cada produto.</p>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}
