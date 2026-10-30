"use client";

/**
 * Gráfico de evolução de preços (Recharts).
 * Não importe este arquivo direto nas páginas: use `price-chart-lazy.tsx`,
 * que só baixa o Recharts (~100 kB) quando o gráfico vai aparecer.
 */
import { useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PERIODS, filterByDays, type ChartSeries } from "@/lib/analytics";
import { formatBRL } from "@/lib/money";
import { useMediaQuery } from "./use-media-query";

export type { ChartSeries };

/** Cores vêm do CSS (globals.css), então acompanham o tema claro/escuro. */
const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];
const TZ = "America/Sao_Paulo";
const dayFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit" });
const fullFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, dateStyle: "short", timeStyle: "short" });
const axisMoney = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const axisMoneyCompact = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });

type Row = { t: number } & Record<string, number>;

/** Junta as séries num formato de linhas { t, s0, s1, ... } que o Recharts entende. Exportada para teste. */
export function buildRows(series: ChartSeries[], days: number | null, now = new Date()) {
  const map = new Map<number, Row>();
  let count = 0;
  let first: string | null = null;
  series.forEach((s, i) => {
    for (const p of filterByDays(s.points, days, now)) {
      const t = new Date(p.collectedAt).getTime();
      const row = map.get(t) ?? ({ t } as Row);
      row[`s${i}`] = p.price;
      map.set(t, row);
      count++;
      if (!first || p.collectedAt < first) first = p.collectedAt;
    }
  });
  return { rows: [...map.values()].sort((a, b) => a.t - b.t), observedFrom: first as string | null, count };
}

export function PriceChart({ series }: { series: ChartSeries[] }) {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["key"]>("30");
  const narrow = useMediaQuery("(max-width: 639px)");
  const days = PERIODS.find((p) => p.key === period)?.days ?? null;
  const { rows, observedFrom, count } = useMemo(() => buildRows(series, days), [series, days]);
  const height = narrow ? 240 : 300;

  return (
    <div>
      <div role="group" aria-label="Período do gráfico" className="mb-4 inline-flex max-w-full flex-wrap gap-1 rounded-lg bg-sunken p-1">
        {PERIODS.map((p) => {
          const on = p.key === period;
          return (
            <button
              key={p.key}
              type="button"
              aria-pressed={on}
              onClick={() => setPeriod(p.key)}
              className={`min-h-9 rounded-md px-3 text-xs font-medium transition-colors duration-150 ${
                on ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      {count === 0 ? (
        <p className="flex items-center justify-center rounded-lg bg-sunken px-4 text-center text-sm text-muted" style={{ height }}>
          Sem coletas válidas neste período. O gráfico é preenchido a cada coleta.
        </p>
      ) : (
        <>
          <div style={{ height }} className="-ml-2 sm:ml-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="t"
                  type="number"
                  scale="time"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(t) => dayFmt.format(new Date(t))}
                  stroke="var(--muted)"
                  tickLine={false}
                  fontSize={12}
                  minTickGap={narrow ? 24 : 40}
                />
                <YAxis
                  tickFormatter={(v: number) => (narrow ? axisMoneyCompact : axisMoney).format(v)}
                  stroke="var(--muted)"
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  width={narrow ? 64 : 84}
                  domain={["auto", "auto"]}
                />
                <Tooltip
                  labelFormatter={(t) => fullFmt.format(new Date(Number(t)))}
                  formatter={(v: number, key: string) => [formatBRL(v), series[Number(key.slice(1))]?.name ?? key]}
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--line)",
                    borderRadius: 10,
                    color: "var(--ink)",
                    boxShadow: "var(--shadow-pop)",
                    fontSize: 13,
                  }}
                  labelStyle={{ color: "var(--muted)", marginBottom: 4 }}
                  cursor={{ stroke: "var(--line-strong)" }}
                />
                {series.length > 1 ? (
                  <Legend
                    formatter={(key: string) => <span style={{ color: "var(--ink)" }}>{series[Number(key.slice(1))]?.name ?? key}</span>}
                    wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                  />
                ) : null}
                {series.map((s, i) => (
                  <Line
                    key={i}
                    type="stepAfter"
                    dataKey={`s${i}`}
                    name={`s${i}`}
                    stroke={COLORS[i % COLORS.length]}
                    strokeWidth={2}
                    dot={rows.length < 40 ? { r: 2.5, strokeWidth: 0, fill: COLORS[i % COLORS.length] } : false}
                    activeDot={{ r: 4 }}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-3 text-xs text-muted">
            Dados a partir de {observedFrom ? fullFmt.format(new Date(observedFrom)) : "—"}. O Aureon só conhece os preços que ele mesmo coletou.
          </p>
        </>
      )}
    </div>
  );
}

export function ProductChartPicker({ options }: { options: { id: string; name: string; series: ChartSeries[] }[] }) {
  const [id, setId] = useState(options[0]?.id ?? "");
  const current = options.find((o) => o.id === id);
  return (
    <div>
      <label className="mb-4 block max-w-md">
        <span className="lbl">Produto</span>
        <select value={id} onChange={(e) => setId(e.target.value)}>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
      {current ? <PriceChart series={current.series} /> : null}
    </div>
  );
}
