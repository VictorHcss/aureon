/**
 * Limite simples em memória (melhor esforço; em ambiente serverless cada
 * instância tem seu próprio contador). Protege login e ações caras.
 */
const buckets = new Map<string, number[]>();

export function allow(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  return true;
}
