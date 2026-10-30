"use client";

/**
 * Versões "preguiçosas" do gráfico. `next/dynamic` separa o Recharts num
 * pedaço de JavaScript à parte, baixado só nas páginas que mostram gráfico,
 * e exibe um esqueleto enquanto carrega. `ssr: false` porque o gráfico mede
 * o tamanho do contêiner, coisa que só existe no navegador.
 */
import dynamic from "next/dynamic";
import { Skeleton } from "./ui";

function ChartSkeleton() {
  return (
    <div aria-busy="true">
      <Skeleton className="mb-4 h-11 w-full max-w-md" />
      <Skeleton className="h-[240px] w-full sm:h-[300px]" />
      <span className="sr-only">Carregando gráfico…</span>
    </div>
  );
}

export const PriceChart = dynamic(() => import("./price-chart").then((m) => m.PriceChart), { ssr: false, loading: ChartSkeleton });
export const ProductChartPicker = dynamic(() => import("./price-chart").then((m) => m.ProductChartPicker), {
  ssr: false,
  loading: ChartSkeleton,
});
