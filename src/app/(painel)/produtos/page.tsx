import type { Metadata } from "next";
import Link from "next/link";
import { IconPlus, IconTag } from "@/components/icons";
import { Badge, ButtonLink, Change, EmptyState, ErrorNotice, Money, PageHeader, SetupNotice, buttonClass } from "@/components/ui";
import { formatDateTime } from "@/lib/dates";
import { isSupabaseConfigured } from "@/lib/db/client";
import { listCategories, loadProductViews, type ProductView } from "@/lib/db/queries";
import { errorMessage } from "@/lib/logger";

export const metadata: Metadata = { title: "Produtos monitorados" };

const STATUS_FILTERS = {
  todos: "Todos",
  ativos: "Monitorados",
  pausados: "Pausados",
  alvo: "No preço-alvo",
  desatualizados: "Desatualizados",
  falhas: "Com falha na coleta",
  arquivados: "Arquivados",
} as const;
const SORTS = { nome: "Nome", preco: "Menor preço", variacao: "Maior queda", data: "Consulta mais recente" } as const;

type Search = { categoria?: string; loja?: string; status?: keyof typeof STATUS_FILTERS; ordem?: keyof typeof SORTS };

function matchStatus(v: ProductView, status: keyof typeof STATUS_FILTERS) {
  switch (status) {
    case "ativos": return v.product.active && !v.product.archived_at;
    case "pausados": return !v.product.active && !v.product.archived_at;
    case "alvo": return v.reachedTarget;
    case "desatualizados": return v.stale;
    case "falhas": return v.hasFailure;
    case "arquivados": return Boolean(v.product.archived_at);
    default: return !v.product.archived_at;
  }
}

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Search> }) {
  if (!isSupabaseConfigured()) return <SetupNotice />;
  const sp = await searchParams;
  const status = sp.status && sp.status in STATUS_FILTERS ? sp.status : "todos";
  const sort = sp.ordem && sp.ordem in SORTS ? sp.ordem : "nome";

  let views: ProductView[];
  let categories;
  try {
    [views, categories] = await Promise.all([loadProductViews({ includeArchived: true }), listCategories()]);
  } catch (e) {
    return <ErrorNotice message={errorMessage(e)} />;
  }
  const stores = [...new Set(views.flatMap((v) => v.sources.map((s) => s.source.store_name)))].sort();

  let list = views.filter((v) => matchStatus(v, status));
  if (sp.categoria) list = list.filter((v) => v.product.category_id === sp.categoria);
  if (sp.loja) list = list.filter((v) => v.sources.some((s) => s.source.store_name === sp.loja));
  list.sort((a, b) => {
    if (sort === "preco") return (a.best?.total ?? Infinity) - (b.best?.total ?? Infinity);
    if (sort === "variacao") return (a.best?.stats.pctChange ?? Infinity) - (b.best?.stats.pctChange ?? Infinity);
    if (sort === "data") return (b.lastCheckedAt ?? "").localeCompare(a.lastCheckedAt ?? "");
    return a.product.name.localeCompare(b.product.name, "pt-BR");
  });

  const badges = (v: ProductView) => (
    <>
      {v.category ? <span>{v.category.name}</span> : null}
      <span>
        {v.sources.length} {v.sources.length === 1 ? "oferta" : "ofertas"}
      </span>
      {v.reachedTarget ? <Badge tone="good">no alvo</Badge> : null}
      {v.stale ? <Badge tone="warn">desatualizado</Badge> : null}
      {v.hasFailure ? <Badge tone="bad">falha na coleta</Badge> : null}
      {!v.product.active ? <Badge>pausado</Badge> : null}
      {v.product.archived_at ? <Badge>arquivado</Badge> : null}
    </>
  );
  const filtered = status !== "todos" || sort !== "nome" || Boolean(sp.categoria) || Boolean(sp.loja);

  return (
    <>
      <PageHeader
        title="Produtos monitorados"
        description="Preço exibido: o menor total entre as lojas monitoradas com coleta recente."
        actions={
          <ButtonLink href="/produtos/novo">
            <IconPlus size={16} /> Novo produto
          </ButtonLink>
        }
      />

      {views.length ? (
        <form method="get" className="mb-5 grid grid-cols-2 gap-3 rounded-xl border border-line bg-surface p-4 shadow-card lg:grid-cols-[1fr_1fr_1fr_1fr_auto] lg:items-end">
          <label className="min-w-0">
            <span className="lbl">Situação</span>
            <select name="status" defaultValue={status}>
              {Object.entries(STATUS_FILTERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="min-w-0">
            <span className="lbl">Categoria</span>
            <select name="categoria" defaultValue={sp.categoria ?? ""}>
              <option value="">Todas</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="min-w-0">
            <span className="lbl">Loja</span>
            <select name="loja" defaultValue={sp.loja ?? ""}>
              <option value="">Todas</option>
              {stores.map((st) => <option key={st} value={st}>{st}</option>)}
            </select>
          </label>
          <label className="min-w-0">
            <span className="lbl">Ordenar por</span>
            <select name="ordem" defaultValue={sort}>
              {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <div className="col-span-2 flex gap-2 lg:col-span-1">
            <button className={`${buttonClass.secondary} flex-1 lg:flex-none`}>Aplicar filtros</button>
            {filtered ? <ButtonLink href="/produtos" variant="secondary">Limpar</ButtonLink> : null}
          </div>
        </form>
      ) : null}

      {!views.length ? (
        <EmptyState
          icon={IconTag}
          title="Nenhum produto cadastrado"
          action={
            <ButtonLink href="/produtos/novo">
              <IconPlus size={16} /> Cadastrar produto
            </ButtonLink>
          }
        >
          Comece pelo item que você mais quer acompanhar. Depois é só colar o link da oferta.
        </EmptyState>
      ) : !list.length ? (
        <EmptyState title="Nenhum produto com esses filtros" action={<ButtonLink href="/produtos" variant="secondary">Limpar filtros</ButtonLink>} />
      ) : (
        <>
          <p className="mb-3 text-sm text-muted" role="status">
            {list.length} {list.length === 1 ? "produto" : "produtos"}
          </p>

          {/* Celular e tablet: cartões (sem rolagem horizontal) */}
          <ul className="space-y-3 md:hidden">
            {list.map((v) => (
              <li key={v.product.id}>
                <Link
                  href={`/produtos/${v.product.id}`}
                  className="block rounded-xl border border-line bg-surface p-4 shadow-card transition-colors duration-150 hover:border-line-strong"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 font-medium break-words">{v.product.name}</p>
                    <div className="shrink-0 text-right">
                      <Money value={v.best?.stats.latest?.price} className="font-semibold" />
                      <div className="text-sm">
                        <Change pct={v.best?.stats.pctChange ?? null} />
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">{badges(v)}</div>
                  <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3 text-xs">
                    <div>
                      <dt className="text-muted">Alvo</dt>
                      <dd><Money value={v.product.target_price} /></dd>
                    </div>
                    <div>
                      <dt className="text-muted">Última consulta</dt>
                      <dd>{formatDateTime(v.lastCheckedAt)}</dd>
                    </div>
                    {v.best ? (
                      <div className="col-span-2">
                        <dt className="sr-only">Loja do melhor preço</dt>
                        <dd className="text-muted">Melhor preço em {v.best.source.store_name}</dd>
                      </div>
                    ) : null}
                  </dl>
                </Link>
              </li>
            ))}
          </ul>

          {/* Telas médias e grandes: tabela para comparar */}
          <div className="hidden overflow-x-auto rounded-xl border border-line bg-surface shadow-card md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-sunken text-left text-xs text-muted">
                <tr>
                  <th scope="col" className="w-[40%] px-4 py-3 font-medium">Produto</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Melhor preço</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Variação</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Alvo</th>
                  <th scope="col" className="px-4 py-3 font-medium">Última consulta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.map((v) => (
                  <tr key={v.product.id} className="align-top transition-colors duration-150 hover:bg-sunken/60">
                    <td className="px-4 py-3.5">
                      <Link href={`/produtos/${v.product.id}`} className="font-medium hover:underline">{v.product.name}</Link>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">{badges(v)}</div>
                    </td>
                    <td className="px-4 py-3.5 text-right font-semibold">
                      <Money value={v.best?.stats.latest?.price} />
                      {v.best ? <div className="text-xs font-normal whitespace-nowrap text-muted">{v.best.source.store_name}</div> : null}
                    </td>
                    <td className="px-4 py-3.5 text-right"><Change pct={v.best?.stats.pctChange ?? null} /></td>
                    <td className="px-4 py-3.5 text-right text-muted"><Money value={v.product.target_price} /></td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-muted">{formatDateTime(v.lastCheckedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
