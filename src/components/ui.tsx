/**
 * Componentes visuais básicos do Aureon (Server Components: sem estado, sem eventos).
 * Qualquer página pode usá-los; mudar o visual aqui muda o painel inteiro.
 */
import Link from "next/link";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { formatBRL, formatPercent } from "@/lib/money";
import { STATUS_LABELS, type CollectionStatus } from "@/lib/types";
import { IconAlert, IconExternal } from "./icons";

type Icon = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight text-balance break-words sm:text-[1.75rem]">{title}</h1>
        {description ? <div className="mt-1.5 text-sm text-muted">{description}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2 sm:shrink-0 sm:justify-end">{actions}</div> : null}
    </header>
  );
}

/** Bloco de conteúdo com título opcional. `flush` remove o recuo interno (útil para tabelas). */
export function Section({
  title, aside, children, className = "", flush = false,
}: { title?: string; aside?: ReactNode; children: ReactNode; className?: string; flush?: boolean }) {
  return (
    <section className={`min-w-0 rounded-xl border border-line bg-surface shadow-card ${className}`}>
      {title ? (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line px-4 py-3 sm:px-5">
          <h2 className="text-[0.95rem] font-semibold">{title}</h2>
          {aside}
        </div>
      ) : null}
      <div className={flush ? "" : "p-4 sm:p-5"}>{children}</div>
    </section>
  );
}

/** Indicador numérico do topo do painel. Só recebe números reais vindos do banco. */
export function StatCard({
  label, value, hint, icon: IconCmp, tone = "neutral", href,
}: { label: string; value: ReactNode; hint?: ReactNode; icon: Icon; tone?: "neutral" | "good" | "bad" | "warn"; href?: string }) {
  const toneCls = { neutral: "text-ink", good: "text-down", bad: "text-up", warn: "text-warn" }[tone];
  const body = (
    <>
      <div className="flex items-center justify-between gap-2 text-muted">
        <span className="text-xs font-medium sm:text-sm">{label}</span>
        <IconCmp size={18} className={tone === "neutral" ? "" : toneCls} />
      </div>
      <p className={`figure mt-2 text-[1.75rem] font-semibold leading-none sm:text-3xl ${toneCls}`}>{value}</p>
      {hint ? <p className="mt-2 text-xs text-muted">{hint}</p> : null}
    </>
  );
  const cls = "block min-w-0 rounded-xl border border-line bg-surface p-4 shadow-card sm:p-5";
  return href ? (
    <Link href={href} className={`${cls} transition-colors duration-150 hover:border-line-strong`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function Change({ pct, abs }: { pct: number | null; abs?: number | null }) {
  if (pct === null || pct === undefined) return <span className="text-muted">—</span>;
  const tone = pct < 0 ? "text-down" : pct > 0 ? "text-up" : "text-muted";
  const arrow = pct < 0 ? "▼" : pct > 0 ? "▲" : "";
  return (
    <span className={`figure whitespace-nowrap font-medium ${tone}`} title={abs != null ? formatBRL(abs) : undefined}>
      {arrow ? <span aria-hidden className="mr-0.5 text-[0.7em]">{arrow}</span> : null}
      {formatPercent(pct)}
      <span className="sr-only">{pct < 0 ? " (queda)" : pct > 0 ? " (alta)" : ""}</span>
    </span>
  );
}

export function Money({ value, className = "" }: { value: number | null | undefined; className?: string }) {
  return <span className={`figure whitespace-nowrap ${className}`}>{formatBRL(value)}</span>;
}

const STATUS_TONE: Record<CollectionStatus, BadgeTone> = {
  success: "good",
  unavailable: "neutral",
  temporary_failure: "warn",
  structure_changed: "bad",
  price_not_found: "warn",
  auth_error: "bad",
  invalid_source: "bad",
};

export function StatusBadge({ status }: { status: CollectionStatus | null }) {
  if (!status) return <Badge>Não consultado</Badge>;
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABELS[status]}</Badge>;
}

type BadgeTone = "neutral" | "good" | "bad" | "warn" | "accent";

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: BadgeTone }) {
  const cls = {
    neutral: "bg-sunken text-muted",
    good: "bg-down-bg text-down",
    bad: "bg-up-bg text-up",
    warn: "bg-warn-bg text-warn",
    accent: "bg-accent-soft text-link",
  }[tone];
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

export function EmptyState({ title, children, action, icon: IconCmp }: { title: string; children?: ReactNode; action?: ReactNode; icon?: Icon }) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
      {IconCmp ? (
        <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-accent-soft text-link">
          <IconCmp size={22} />
        </span>
      ) : null}
      <p className="font-semibold">{title}</p>
      {children ? <div className="mx-auto mt-1.5 max-w-md text-sm text-muted">{children}</div> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 sm:min-h-10";

export const buttonClass = {
  primary: `${base} bg-accent text-accent-ink hover:bg-[color-mix(in_srgb,var(--accent)_88%,black)]`,
  secondary: `${base} border border-line-strong bg-surface text-ink hover:bg-sunken`,
  danger: `${base} border border-up/40 bg-surface text-up hover:bg-up-bg`,
  /** Confirmação final de algo irreversível (excluir). */
  destructive: `${base} bg-up text-paper hover:opacity-90`,
  quiet:
    "inline-flex min-h-9 items-center gap-1 rounded-md text-sm font-medium text-link underline-offset-4 transition-colors duration-150 hover:underline disabled:pointer-events-none disabled:opacity-50",
};

export function ButtonLink({ href, children, variant = "primary" }: { href: string; children: ReactNode; variant?: keyof typeof buttonClass }) {
  return (
    <Link href={href} className={buttonClass[variant]}>
      {children}
    </Link>
  );
}

/** Link externo seguro: só aceita https, abre em nova aba e não vaza o referrer. */
export function ExternalLink({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  let safe = "#";
  try {
    const u = new URL(href);
    if (u.protocol === "https:") safe = u.toString();
  } catch {
    /* mantém # */
  }
  return (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className={`inline-flex items-center gap-1 text-link underline-offset-4 hover:underline ${className}`}
    >
      {children}
      <IconExternal size={13} className="shrink-0 opacity-70" />
      <span className="sr-only"> (abre em nova aba)</span>
    </a>
  );
}

export function SetupNotice() {
  return (
    <div className="mx-auto max-w-xl rounded-xl border border-line bg-surface p-6 shadow-card">
      <span className="mb-4 flex size-11 items-center justify-center rounded-xl bg-warn-bg text-warn">
        <IconAlert size={20} />
      </span>
      <h1 className="text-lg font-semibold">Falta conectar o banco de dados</h1>
      <p className="mt-2 text-sm text-muted">
        O Aureon ainda não encontrou as credenciais do Supabase. Defina <code>SUPABASE_URL</code> e{" "}
        <code>SUPABASE_SERVICE_ROLE_KEY</code> no arquivo <code>.env.local</code> (ou nas variáveis da Vercel) e aplique a migração
        de <code>supabase/migrations</code>. O passo a passo está em <code>docs/01-instalacao-e-configuracao.md</code>.
      </p>
    </div>
  );
}

export function ErrorNotice({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-xl border border-up/40 bg-up-bg p-4 text-sm text-up">
      <p className="font-semibold">Não foi possível carregar os dados.</p>
      <p className="mt-1 break-words">{message}</p>
    </div>
  );
}

/** Retângulo de carregamento. A animação respeita "reduzir movimento". */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-line/70 ${className}`} />;
}
