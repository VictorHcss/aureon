import { describe, expect, it } from "vitest";
import { ProductInput, RuleInput, SettingsInput, SourceInput } from "@/lib/validation";

describe("cadastro de produto", () => {
  it("aceita dados válidos e converte valores em reais", () => {
    const r = ProductInput.parse({ name: "  SSD Kingston 1TB ", brand: "", category_id: "", target_price: "R$ 399,90", max_price: "450", notes: "", active: true });
    expect(r).toMatchObject({ name: "SSD Kingston 1TB", brand: null, category_id: null, target_price: 399.9, max_price: 450, notes: null });
  });
  it("rejeita nome vazio, valor inválido e alvo acima do máximo", () => {
    expect(ProductInput.safeParse({ name: " " }).success).toBe(false);
    expect(ProductInput.safeParse({ name: "SSD", target_price: "abc" }).success).toBe(false);
    expect(ProductInput.safeParse({ name: "SSD", target_price: "0" }).success).toBe(false);
    const r = ProductInput.safeParse({ name: "SSD", target_price: "500", max_price: "400" });
    expect(r.success).toBe(false);
  });
  it("preço vazio vira null (não zero)", () => {
    expect(ProductInput.parse({ name: "SSD", target_price: "" }).target_price).toBeNull();
  });
});

describe("cadastro de fonte", () => {
  it("normaliza URL do Mercado Livre e extrai o código", () => {
    const r = SourceInput.parse({ product_url: "https://produto.mercadolivre.com.br/MLB-1234567890-ssd-_JM#position=1" });
    expect(r.source_type).toBe("mercadolivre");
    expect(r.external_identifier).toBe("item:MLB1234567890");
    expect(r.store_name).toBe("Mercado Livre");
  });
  it("rejeita lojas não suportadas e URLs sem código", () => {
    expect(SourceInput.safeParse({ product_url: "https://www.kabum.com.br/produto/1" }).success).toBe(false);
    expect(SourceInput.safeParse({ product_url: "https://www.mercadolivre.com.br/ofertas" }).success).toBe(false);
  });
});

describe("regras e configurações", () => {
  it("valida regras", () => {
    expect(RuleInput.safeParse({ rule_type: "percent_drop", threshold: "" }).success).toBe(false);
    expect(RuleInput.safeParse({ rule_type: "percent_drop", threshold: "150" }).success).toBe(false);
    expect(RuleInput.parse({ rule_type: "percent_drop", threshold: "5,5", cooldown_hours: "12" })).toMatchObject({ threshold: 5.5, cooldown_hours: 12 });
    expect(RuleInput.parse({ rule_type: "target_price", threshold: "" }).threshold).toBeNull();
    expect(RuleInput.safeParse({ rule_type: "hack", threshold: "1" }).success).toBe(false);
  });
  it("valida configurações de canais", () => {
    const base = { email_enabled: true, email_to: "a@b.com, c@d.com", telegram_enabled: true, telegram_chat_id: "-100123", whatsapp_enabled: false, whatsapp_to: "+55 11 99999-8888", daily_summary_enabled: true, alerts_enabled: true, only_relevant: false, stale_after_hours: "48" };
    expect(SettingsInput.parse(base).whatsapp_to).toBe("5511999998888");
    expect(SettingsInput.safeParse({ ...base, email_to: "inválido" }).success).toBe(false);
    expect(SettingsInput.safeParse({ ...base, telegram_chat_id: "abc" }).success).toBe(false);
  });
});
