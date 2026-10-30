import { describe, expect, it } from "vitest";
import { createSessionValue, passwordMatches, SESSION_TTL_MS, verifySessionValue } from "@/lib/auth/session";
import { maskIdentifier, redact } from "@/lib/logger";

const SECRET = "x".repeat(40);

describe("sessão do administrador", () => {
  it("aceita sessão válida e recusa adulterada, expirada ou com outro segredo", async () => {
    const now = 1_800_000_000_000;
    const v = await createSessionValue(SECRET, now);
    expect(await verifySessionValue(v, SECRET, now + 1000)).toBe(true);
    expect(await verifySessionValue(v, SECRET, now + SESSION_TTL_MS + 1)).toBe(false);
    expect(await verifySessionValue(v, "y".repeat(40), now)).toBe(false);
    const [exp, sig] = v.split(".");
    expect(await verifySessionValue(`${Number(exp) + 999999}.${sig}`, SECRET, now)).toBe(false);
    expect(await verifySessionValue(undefined, SECRET, now)).toBe(false);
    expect(await verifySessionValue("lixo", SECRET, now)).toBe(false);
  });
  it("segredo curto invalida qualquer sessão", async () => {
    await expect(createSessionValue("curto")).rejects.toThrow("SESSION_SECRET");
    expect(await verifySessionValue("1.abc", "curto")).toBe(false);
  });
  it("compara senha", async () => {
    expect(await passwordMatches("abc123", "abc123", SECRET)).toBe(true);
    expect(await passwordMatches("abc124", "abc123", SECRET)).toBe(false);
    expect(await passwordMatches("", undefined, SECRET)).toBe(false);
  });
});

describe("logs sem segredos", () => {
  it("remove tokens conhecidos", () => {
    const text = "url https://api.telegram.org/bot123456:AAH-abcdefghijklmnopqrstuvwxyz/sendMessage Bearer APP_USR-123-abc re_abcdefghijklmnop TG-abc-123";
    const out = redact(text);
    expect(out).not.toContain("AAH-abcdefghijklmnopqrstuvwxyz");
    expect(out).not.toContain("APP_USR-123-abc");
    expect(out).not.toContain("re_abcdefghijklmnop");
    expect(out).not.toContain("TG-abc-123");
  });
  it("mascara telefones", () => {
    expect(maskIdentifier("5511999998888")).toBe("********8888");
  });
});
