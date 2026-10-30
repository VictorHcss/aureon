import { Skeleton } from "@/components/ui";

/** Esqueleto exibido enquanto uma página do painel busca dados no servidor. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <Skeleton className="mb-2 h-8 w-56" />
      <Skeleton className="mb-8 h-4 w-80 max-w-full" />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
      <span className="sr-only">Carregando…</span>
    </div>
  );
}
