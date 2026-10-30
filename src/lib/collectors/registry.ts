import type { SourceType } from "../types";
import { mercadoLivreCollector } from "./mercadolivre";
import type { Collector } from "./types";

/** Para adicionar uma loja: implemente `Collector` e registre aqui. */
const collectors: Record<SourceType, Collector> = {
  mercadolivre: mercadoLivreCollector,
};

export function getCollector(type: string): Collector | null {
  return (collectors as Record<string, Collector | undefined>)[type] ?? null;
}

export function listCollectors(): Collector[] {
  return Object.values(collectors);
}
