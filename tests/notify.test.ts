import { describe, expect, it } from "vitest";
import { createTelegramSender, splitMessage } from "@/lib/notify/telegram";
import { createResendSender } from "@/lib/notify/resend";
import { createWhatsAppSender, sanitizeTemplateParam } from "@/lib/notify/whatsapp";
import { buildSenders } from "@/lib/notify/senders";
import { DEFAULT_SETTINGS } from "@/lib/db/repository";
import { readEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { renderTestMessage } from "@/lib/reports/render";
import { json, mockFetch } from "./helpers/memory-repository";

const msg = renderTestMessage(new Date("2026-10-27T11:00:00Z"));
const logger = createLogger({}, true);

describe("Telegram", () => {
  it("envia com parse_mode HTML e devolve o id", async () => {
    const m = mockFetch([[/api\.telegram\.org\/bot123:ABC\/sendMessage/, () => json({ ok: true, result: { message_id: 77 } })]]);
    const r = await createTelegramSender({ token: "123:ABC", chatId: "999", fetch: m.fetch }).send(msg, "k");
    expect(r.providerMessageId).toBe("77");
    const body = JSON.parse(String(m.calls[0]!.init!.body));
    expect(body).toMatchObject({ chat_id: "999", parse_mode: "HTML" });
  });
  it("erro da API vira ProviderError legível", async () => {
    const m = mockFetch([[/telegram/, () => json({ ok: false, description: "Bad Request: chat not found" }, 400)]]);
    await expect(createTelegramSender({ token: "1:A", chatId: "x", fetch: m.fetch }).send(msg, "k")).rejects.toThrow("chat not found");
  });
  it("divide mensagens longas", () => {
    const long = Array.from({ length: 300 }, (_, i) => `linha ${i} ${"x".repeat(30)}`).join("\n");
    const parts = splitMessage(long, 4000);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= 4000)).toBe(true);
    expect(parts.join("\n")).toBe(long);
  });
});

describe("Resend", () => {
  it("envia HTML + texto com chave de idempotência", async () => {
    const m = mockFetch([[/api\.resend\.com\/emails/, () => json({ id: "em_1" })]]);
    const r = await createResendSender({ apiKey: "re_test_key", from: "Monitor <a@b.com>", to: ["x@y.com"], fetch: m.fetch }).send(msg, "daily:2026-10-27");
    expect(r.providerMessageId).toBe("em_1");
    const headers = m.calls[0]!.init!.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe("daily:2026-10-27");
    const body = JSON.parse(String(m.calls[0]!.init!.body));
    expect(body.text).toBeTruthy();
    expect(body.html).toBeTruthy();
  });
  it("erro do provedor é propagado", async () => {
    const m = mockFetch([[/resend/, () => json({ message: "The from address is not verified" }, 403)]]);
    await expect(createResendSender({ apiKey: "k", from: "a", to: ["b"], fetch: m.fetch }).send(msg, "k")).rejects.toThrow("not verified");
  });
});

describe("WhatsApp Cloud API", () => {
  it("envia modelo com um parâmetro sanitizado", async () => {
    const m = mockFetch([[/graph\.facebook\.com\/v23\.0\/555\/messages/, () => json({ messages: [{ id: "wamid.X" }] })]]);
    const sender = createWhatsAppSender({ token: "t", phoneNumberId: "555", to: "+55 (11) 99999-8888", templateName: "alerta_preco", templateLang: "pt_BR", apiVersion: "v23.0", fetch: m.fetch });
    const r = await sender.send({ ...msg, whatsapp: "linha 1\nlinha 2\t\tfim" }, "k");
    expect(r.providerMessageId).toBe("wamid.X");
    const body = JSON.parse(String(m.calls[0]!.init!.body));
    expect(body.to).toBe("5511999998888");
    expect(body.template.components[0].parameters[0].text).toBe("linha 1 | linha 2 | fim");
  });
  it("erro da Meta é legível", async () => {
    const m = mockFetch([[/graph/, () => json({ error: { message: "Template name does not exist", code: 132001 } }, 404)]]);
    const sender = createWhatsAppSender({ token: "t", phoneNumberId: "1", to: "5511", templateName: "x", templateLang: "pt_BR", apiVersion: "v23.0", fetch: m.fetch });
    await expect(sender.send(msg, "k")).rejects.toThrow("132001");
  });
  it("limita o tamanho do parâmetro", () => {
    expect(sanitizeTemplateParam("a".repeat(2000)).length).toBe(1000);
  });
});

describe("montagem dos canais", () => {
  it("só inclui canais habilitados e configurados", () => {
    const env = readEnv({ RESEND_API_KEY: "re_x", EMAIL_FROM: "a@b.com", TELEGRAM_BOT_TOKEN: "1:A" });
    const senders = buildSenders(env, { ...DEFAULT_SETTINGS, email_enabled: true, email_to: "x@y.com", telegram_enabled: true, telegram_chat_id: "123", whatsapp_enabled: true }, fetch, logger);
    expect(senders.map((s) => s.channel)).toEqual(["email", "telegram"]);
    expect(buildSenders(env, DEFAULT_SETTINGS, fetch, logger)).toHaveLength(0);
  });
});
