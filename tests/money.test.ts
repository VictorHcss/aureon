import { describe, expect, it } from "vitest";
import { formatBRL, formatPercent, isValidPrice, parseBRL, roundMoney } from "@/lib/money";

describe("parseBRL", () => {
  it.each([
    ["R$ 1.234,56", 1234.56],
    ["1234,56", 1234.56],
    ["1234.56", 1234.56],
    ["1.234", 1234],
    ["1,234.50", 1234.5],
    ["R$\u00a0999,9", 999.9],
    ["10.000.000,00", null],
    ["12.345.678", null],
    ["2.499,00", 2499],
    [" 89 ", 89],
  ])("converte %s", (input, expected) => {
    expect(parseBRL(input)).toBe(expected);
  });

  it("não transforma vazio ou inválido em zero", () => {
    expect(parseBRL("")).toBeNull();
    expect(parseBRL("   ")).toBeNull();
    expect(parseBRL("abc")).toBeNull();
    expect(parseBRL("0")).toBeNull();
    expect(parseBRL("-10")).toBeNull();
    expect(parseBRL(null)).toBeNull();
  });

  it("valida números", () => {
    expect(isValidPrice(10)).toBe(true);
    expect(isValidPrice(0)).toBe(false);
    expect(isValidPrice(Number.NaN)).toBe(false);
    expect(isValidPrice("10")).toBe(false);
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
  });
});

describe("formatação", () => {
  it("formata reais e percentuais", () => {
    expect(formatBRL(1234.5).replace(/\s/g, " ")).toBe("R$ 1.234,50");
    expect(formatBRL(null)).toBe("—");
    expect(formatPercent(-5.25)).toBe("−5,3%");
    expect(formatPercent(3)).toBe("+3,0%");
    expect(formatPercent(null)).toBe("—");
  });
});
