import { describe, expect, it } from "vitest";
import { computeStats, filterByDays, isStale, percentChange, reachedTarget, totalPrice, validPoints } from "@/lib/analytics";
import { makePrice } from "./helpers/memory-repository";

describe("estatísticas de preço", () => {
  const records = [
    makePrice("s", 100, "2026-10-01T11:00:00Z"),
    makePrice("s", null, "2026-10-02T11:00:00Z"),
    makePrice("s", 90, "2026-10-03T11:00:00Z"),
    makePrice("s", 110, "2026-10-04T11:00:00Z"),
    makePrice("s", 80, "2026-10-05T11:00:00Z"),
  ];

  it("ignora coletas inválidas e calcula variações", () => {
    const points = validPoints(records);
    expect(points).toHaveLength(4);
    const s = computeStats(points);
    expect(s.latest?.price).toBe(80);
    expect(s.previous?.price).toBe(110);
    expect(s.absChange).toBe(-30);
    expect(s.pctChange).toBe(-27.27);
    expect(s.min).toBe(80);
    expect(s.max).toBe(110);
    expect(s.avg).toBe(95);
    expect(s.minAt).toBe("2026-10-05T11:00:00Z");
    expect(s.firstAt).toBe("2026-10-01T11:00:00Z");
    expect(s.isHistoricLow).toBe(true);
  });

  it("um único ponto não é 'menor histórico' nem tem variação", () => {
    const s = computeStats(validPoints([makePrice("s", 50, "2026-10-01T00:00:00Z")]));
    expect(s.pctChange).toBeNull();
    expect(s.isHistoricLow).toBe(false);
  });

  it("histórico vazio", () => {
    expect(computeStats([]).samples).toBe(0);
  });

  it("percentual e alvo", () => {
    expect(percentChange(200, 150)).toBe(-25);
    expect(percentChange(0, 10)).toBeNull();
    expect(reachedTarget(99.9, 100)).toBe(true);
    expect(reachedTarget(100, 100)).toBe(true);
    expect(reachedTarget(100.01, 100)).toBe(false);
    expect(reachedTarget(null, 100)).toBe(false);
    expect(reachedTarget(50, null)).toBe(false);
  });

  it("frete só entra no total quando conhecido", () => {
    expect(totalPrice(100, null)).toEqual({ total: 100, shippingKnown: false });
    expect(totalPrice(100, 19.9)).toEqual({ total: 119.9, shippingKnown: true });
  });

  it("períodos e dados desatualizados", () => {
    const now = new Date("2026-10-05T12:00:00Z");
    const pts = validPoints(records);
    expect(filterByDays(pts, 2, now)).toHaveLength(2);
    expect(filterByDays(pts, null, now)).toHaveLength(4);
    expect(isStale("2026-10-05T00:00:00Z", 48, now)).toBe(false);
    expect(isStale("2026-10-01T00:00:00Z", 48, now)).toBe(true);
    expect(isStale(null, 48, now)).toBe(true);
  });
});
