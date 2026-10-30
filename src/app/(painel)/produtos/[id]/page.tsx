import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  collectSourceNow, deleteProduct, deleteRule, deleteSource, setProductActive, setProductArchived, setRuleActive, setSourceActive,
} from "@/app/actions";
import { ConfirmAction, RunAction } from "@/components/action-buttons";
import { ProductForm, RuleForm, SourceForm } from "@/components/forms";
import { PriceChart } from "@/components/price-chart-lazy";
import { Badge, Change, ErrorNotice, ExternalLink, Money, PageHeader, Section, SetupNotice, StatusBadge } from "@/components/ui";
import { reachedTarget } from "@/lib/analytics";
import { formatDate, formatDateTime } from "@/lib/dates";
import { isSupabaseConfigured } from "@/lib/db/client";
import { listCategories, listRecentAlerts, listRules, loadProductViews, type SourceView } from "@/lib/db/queries";
import { errorMessage } from "@/lib/logger";
import { RULE_LABELS } from "@/lib/types";

export const metadata: Metadata = { title: "Produto" };
/**
 * Tempo máximo (s) desta página na Vercel. O "Consultar agora" roda aqui
 * (Server Action) e pode repetir chamadas à API do Mercado Livre com timeout
 * de 15 s cada. 60 s cabe em todos os planos da Vercel.
 */
export const maxDuration = 60;

const UUID = /^[0-9a-f-]{36}$/i;

function ruleValue(type: string, v: number | null) {
  if (v === null) return type === "target_price" ? "alvo do produto" : "—";
  if (type === "percent_drop") return `${v}%`;
  if (type === "stale_data") return `${v} h`;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function shippingCell(s: SourceView) {
  if (!s.stats.latest) return "—";
  return s.shippingKnown ? <Money value={s.stats.latest.shipping} /> : <span className="text-xs text-muted">não informado</span>;
}

function totalCell(s: SourceView) {
  if (s.total === null) return "—";
  return (
    <>
      {s.shippingKnown ? null : <span className="text-xs text-muted">sem frete </span>}
      <Money value={s.total} />
    </>
  );
}

/** Ações de uma oferta (usadas no cartão e na tabela). */
function SourceActions({ s, productId }: { s: SourceView; productId: string }) {
  return (
    <>
      <RunAction action={collectSourceNow.bind(null, s.source.id, productId)} label="Consultar agora" pendingLabel="Consultando…" variant="quiet" />
      <RunAction action={setSourceActive.bind(null, s.source.id, productId, !s.source.active)} label={s.source.active ? "Desativar" : "Ativar"} variant="quiet" />
      <ConfirmAction
        action={deleteSource.bind(null, s.source.id, productId)}
        label="Remover"
        variant="quiet"
        title="Remover esta oferta?"
        description="O histórico de preços desta loja também será apagado. Para manter o histórico, desative a oferta."
        confirmLabel="Remover oferta"
      />
    </>
  );
}

export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ novo?: string }> }) {
  if (!isSupabaseConfigured()) return <SetupNotice />;
  const { id } = await params;
  const { novo } = await searchParams;
  if (!UUID.test(id)) notFound();

  let data;
  try {
    const [views, categories, rules, alerts] = await Promise.all([
      loadProductViews({ includeArchived: true, productId: id }),
      listCategories(),
      listRules(id),
      listRecentAlerts(10, id),
    ]);
    data = { view: views[0], categories, rules, alerts };
  } catch (e) {
    return <ErrorNotice message={errorMessage(e)} />;
  }
  const { view, categories, rules, alerts } = data;
  if (!view) notFound();
  const { product, sources } = view;
  const archived = Boolean(product.archived_at);

  const withPoints = sources.filter((s) => s.points.length);
  const allPoints = withPoints.flatMap((s) => s.points);
  const overallMin = allPoints.length ? allPoints.reduce((a, b) => (b.price < a.price ? b : a)) : null;

  return (
    <>
      <PageHeader
        title={product.name}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {[product.brand, product.model, view.category?.name].filter(Boolean).join(", ") || "Sem marca, modelo ou categoria"}
            {!product.active ? <Badge>pausado</Badge> : null}
            {archived ? <Badge>arquivado</Badge> : null}
            {view.reachedTarget ? <Badge tone="good">no preço-alvo</Badge> : null}
          </span>
        }
        actions={
          <>
            <RunAction action={setProductActive.bind(null, product.id, !product.active)} label={product.active ? "Pausar monitoramento" : "Retomar monitoramento"} />
            <RunAction action={setProductArchived.bind(null, product.id, !archived)} label={archived ? "Desarquivar" : "Arquivar"} />
            <ConfirmAction
              action={deleteProduct.bind(null, product.id)}
              label="Excluir"
              title="Excluir este produto?"
              description="O produto, suas ofertas, todo o histórico de preços e as regras de alerta serão apagados. Para guardar o histórico, prefira arquivar."
              confirmLabel="Excluir definitivamente"
            />
          </>
        }
      />

      {novo ? (
        <p role="status" className="mb-5 rounded-xl border border-down/30 bg-down-bg px-4 py-3 text-sm text-down">
          Produto cadastrado. Agora adicione o link da oferta no Mercado Livre logo abaixo.
        </p>
      ) : null}

      <div className="space-y-6">
        <Section title="Comparação entre lojas" aside={<span className="text-xs text-muted">menor preço entre as lojas monitoradas</span>}>
          {sources.length ? (
            <>
              {/* Até telas grandes: um cartão por loja */}
              <ul className="space-y-3 xl:hidden">
                {sources.map((s) => {
                  const isBest = view.best?.source.id === s.source.id && sources.length > 1;
                  return (
                    <li key={s.source.id} className={`rounded-lg border border-line p-4 ${s.source.active ? "" : "opacity-60"}`}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <ExternalLink href={s.source.product_url} className="font-medium">{s.source.store_name}</ExternalLink>
                          <div className="text-xs text-muted break-all">{s.source.external_identifier?.replace(/^(item|catalog):/, "")}</div>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {isBest ? <Badge tone="good">melhor oferta</Badge> : null}
                          <StatusBadge status={s.source.last_status} />
                          {s.stale && s.stats.latest ? <Badge tone="warn">desatualizado</Badge> : null}
                        </div>
                      </div>
                      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
                        <div>
                          <dt className="text-xs text-muted">Preço</dt>
                          <dd className="font-semibold"><Money value={s.stats.latest?.price} /></dd>
                          {s.lastRecord?.original_price && s.lastRecord.collection_status === "success" ? (
                            <dd className="text-xs text-muted line-through"><Money value={s.lastRecord.original_price} /></dd>
                          ) : null}
                        </div>
                        <div>
                          <dt className="text-xs text-muted">Frete</dt>
                          <dd>{shippingCell(s)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted">Total estimado</dt>
                          <dd>{totalCell(s)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted">Variação</dt>
                          <dd><Change pct={s.stats.pctChange} abs={s.stats.absChange} /></dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted">Menor observado</dt>
                          <dd><Money value={s.stats.min} /> <span className="text-xs text-muted">{formatDate(s.stats.minAt)}</span></dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted">Última consulta</dt>
                          <dd className="text-xs">{formatDateTime(s.source.last_checked_at)}</dd>
                        </div>
                      </dl>
                      {s.source.last_error && s.source.last_status !== "success" ? (
                        <p className="mt-3 rounded-md bg-up-bg px-3 py-2 text-xs text-up break-words">{s.source.last_error}</p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line pt-3">
                        <SourceActions s={s} productId={product.id} />
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* Telas grandes: tabela de comparação */}
              <div className="hidden overflow-x-auto xl:block">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted">
                    <tr>
                      <th scope="col" className="pb-2 font-medium">Loja</th>
                      <th scope="col" className="pb-2 text-right font-medium">Preço</th>
                      <th scope="col" className="pb-2 text-right font-medium">Frete</th>
                      <th scope="col" className="pb-2 text-right font-medium">Total estimado</th>
                      <th scope="col" className="pb-2 text-right font-medium">Variação</th>
                      <th scope="col" className="pb-2 text-right font-medium">Menor observado</th>
                      <th scope="col" className="pb-2 pl-4 font-medium">Situação</th>
                      <th scope="col" className="pb-2 font-medium"><span className="sr-only">Ações</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sources.map((s) => {
                      const isBest = view.best?.source.id === s.source.id && sources.length > 1;
                      return (
                        <tr key={s.source.id} className={`border-t border-line align-top ${s.source.active ? "" : "opacity-60"}`}>
                          <td className="py-3 pr-3">
                            <ExternalLink href={s.source.product_url} className="font-medium">{s.source.store_name}</ExternalLink>
                            <div className="text-xs text-muted">{s.source.external_identifier?.replace(/^(item|catalog):/, "")}</div>
                            {isBest ? <div className="mt-1"><Badge tone="good">melhor oferta</Badge></div> : null}
                          </td>
                          <td className="py-3 text-right font-semibold">
                            <Money value={s.stats.latest?.price} />
                            {s.lastRecord?.original_price && s.lastRecord.collection_status === "success" ? (
                              <div className="text-xs font-normal text-muted line-through"><Money value={s.lastRecord.original_price} /></div>
                            ) : null}
                          </td>
                          <td className="py-3 text-right">{shippingCell(s)}</td>
                          <td className="py-3 text-right">{totalCell(s)}</td>
                          <td className="py-3 text-right"><Change pct={s.stats.pctChange} abs={s.stats.absChange} /></td>
                          <td className="py-3 text-right">
                            <Money value={s.stats.min} />
                            <div className="text-xs text-muted">{formatDate(s.stats.minAt)}</div>
                          </td>
                          <td className="py-3 pl-4">
                            <StatusBadge status={s.source.last_status} />
                            <div className="mt-1 text-xs text-muted">consulta: {formatDateTime(s.source.last_checked_at)}</div>
                            <div className="text-xs text-muted">último preço válido: {formatDateTime(s.stats.latest?.collectedAt ?? null)}</div>
                            {s.source.last_error && s.source.last_status !== "success" ? <div className="mt-1 max-w-64 text-xs text-up">{s.source.last_error}</div> : null}
                            {s.stale && s.stats.latest ? <div className="mt-1"><Badge tone="warn">desatualizado</Badge></div> : null}
                          </td>
                          <td className="py-3 pl-3">
                            <div className="flex flex-col items-start">
                              <SourceActions s={s} productId={product.id} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="mb-4 text-sm text-muted">Nenhuma oferta cadastrada para este produto. Cole o link abaixo para começar.</p>
          )}
          <div className="mt-5 border-t border-line pt-5">
            <SourceForm productId={product.id} />
          </div>
        </Section>

        <Section title="Histórico de preços">
          {withPoints.length ? (
            <>
              <dl className="mb-5 grid grid-cols-2 gap-4 rounded-lg bg-sunken p-4 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-muted">Menor preço observado</dt>
                  <dd className="font-semibold"><Money value={overallMin?.price} /></dd>
                  <dd className="text-xs text-muted">{formatDate(overallMin?.collectedAt ?? null)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Maior preço observado</dt>
                  <dd className="font-semibold"><Money value={Math.max(...allPoints.map((p) => p.price))} /></dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Média do período</dt>
                  <dd className="font-semibold"><Money value={allPoints.reduce((a, p) => a + p.price, 0) / allPoints.length} /></dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Preço-alvo</dt>
                  <dd className="font-semibold"><Money value={product.target_price} /></dd>
                  <dd className="text-xs text-muted">{view.best && reachedTarget(view.best.stats.latest?.price, product.target_price) ? "atingido" : product.target_price ? "ainda não atingido" : "não definido"}</dd>
                </div>
              </dl>
              <PriceChart series={withPoints.map((s) => ({ name: s.source.store_name, points: s.points }))} />
            </>
          ) : (
            <p className="text-sm text-muted">Ainda não há coletas válidas. Use “Consultar agora” em uma oferta ou aguarde a coleta diária.</p>
          )}
        </Section>

        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Regras de alerta">
            {rules.length ? (
              <ul className="mb-5 divide-y divide-line text-sm">
                {rules.map((r) => (
                  <li key={r.id} className={`flex flex-wrap items-center justify-between gap-2 py-2.5 ${r.active ? "" : "opacity-60"}`}>
                    <span>
                      {RULE_LABELS[r.rule_type]}
                      <span className="block text-xs text-muted">Valor: {ruleValue(r.rule_type, r.threshold)}. Espera: {r.cooldown_hours} h.</span>
                    </span>
                    <span className="flex gap-4">
                      <RunAction action={setRuleActive.bind(null, r.id, product.id, !r.active)} label={r.active ? "Pausar" : "Ativar"} variant="quiet" />
                      <ConfirmAction action={deleteRule.bind(null, r.id, product.id)} label="Excluir" variant="quiet" title="Excluir esta regra?" description="Os alertas já enviados continuam registrados." confirmLabel="Excluir regra" />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-4 text-sm text-muted">Sem regras. Sem elas, o produto aparece só no relatório diário.</p>
            )}
            <RuleForm productId={product.id} />
          </Section>

          <Section title="Alertas deste produto">
            {alerts.length ? (
              <ul className="space-y-2 text-sm">
                {alerts.map((a) => (
                  <li key={a.id}>
                    {RULE_LABELS[a.rule_type]}
                    <span className="block text-xs text-muted">{formatDateTime(a.created_at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Nenhum alerta disparado ainda.</p>
            )}
          </Section>
        </div>

        <Section title="Dados do produto">
          <ProductForm product={product} categories={categories} />
        </Section>
      </div>
    </>
  );
}
