/** Conversão, validação e formatação de valores monetários em reais. */

const MAX_PRICE = 10_000_000;

/** Arredonda para centavos evitando erros de ponto flutuante. */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function toCents(value: number): number {
  return Math.round(value * 100);
}

/** Um preço válido é finito, positivo e dentro de um teto razoável. */
export function isValidPrice(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value < MAX_PRICE;
}

/**
 * Converte texto digitado pelo usuário ("R$ 1.234,56", "1234.56", "1234,5")
 * em número. Retorna null quando não for possível identificar um valor.
 * Nunca retorna 0 para entradas vazias.
 */
export function parseBRL(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") return isValidPrice(input) ? roundMoney(input) : null;

  let s = input.replace(/R\$|\s|\u00a0/gi, "").trim();
  if (!s) return null;
  if (!/^[0-9.,]+$/.test(s)) return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  if (lastComma > -1 && lastDot > -1) {
    // O último separador é o decimal
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma > -1) {
    const decimals = s.length - lastComma - 1;
    if ((s.match(/,/g) ?? []).length > 1 || decimals === 3) s = s.replace(/,/g, "");
    else s = s.replace(",", ".");
  } else if (lastDot > -1) {
    const decimals = s.length - lastDot - 1;
    // "1.234" no padrão brasileiro é milhar
    if ((s.match(/\./g) ?? []).length > 1 || decimals === 3) s = s.replace(/\./g, "");
  }

  const value = Number(s);
  return isValidPrice(value) ? roundMoney(value) : null;
}

const brlFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatBRL(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return brlFormatter.format(value);
}

export function formatPercent(value: number | null | undefined, withSign = true): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const formatted = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(
    Math.abs(value),
  );
  if (!withSign || value === 0) return `${formatted}%`;
  return `${value > 0 ? "+" : "−"}${formatted}%`;
}
