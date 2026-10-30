"use client";

import { useSyncExternalStore } from "react";

/**
 * Lê uma media query CSS no cliente e re-renderiza quando ela muda.
 * `useSyncExternalStore` é a forma recomendada pelo React para assinar
 * fontes externas (como o navegador); no servidor devolvemos `fallback`.
 */
export function useMediaQuery(query: string, fallback = false): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", notify);
      return () => mql.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => fallback,
  );
}
