import { describe, expect, it } from "vitest";
import { checkProductUrl } from "@/lib/url-allowlist";

describe("allowlist de URLs (SSRF)", () => {
  it("aceita domínios do Mercado Livre", () => {
    expect(checkProductUrl("https://produto.mercadolivre.com.br/MLB-123456789-x").sourceType).toBe("mercadolivre");
    expect(checkProductUrl("https://www.mercadolivre.com.br/x/p/MLB123456").ok).toBe(true);
  });
  it.each([
    "http://produto.mercadolivre.com.br/MLB-1",
    "https://mercadolivre.com.br.evil.com/MLB-1",
    "https://evilmercadolivre.com.br/MLB-1",
    "https://user:pw@produto.mercadolivre.com.br/MLB-1",
    "https://produto.mercadolivre.com.br:8443/MLB-1",
    "https://127.0.0.1/",
    "https://169.254.169.254/latest/meta-data",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "não é url",
  ])("rejeita %s", (url) => {
    expect(checkProductUrl(url).ok).toBe(false);
  });
});
