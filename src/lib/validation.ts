/** Validação dos formulários do painel (servidor). */
import { z } from "zod";
import { parseBRL } from "./money";
import { RULE_TYPES } from "./types";
import { checkProductUrl } from "./url-allowlist";
import { getCollector } from "./collectors/registry";

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use no máximo ${max} caracteres.`)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null);

const money = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((v, ctx) => {
    if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return null;
    const parsed = parseBRL(v);
    if (parsed === null) {
      ctx.addIssue({ code: "custom", message: "Informe um valor em reais válido, por exemplo 1.299,90." });
      return z.NEVER;
    }
    return parsed;
  });

export const ProductInput = z
  .object({
    name: z.string().trim().min(2, "Informe o nome do produto.").max(160, "Use no máximo 160 caracteres."),
    brand: text(80),
    model: text(120),
    category_id: z
      .string()
      .uuid("Categoria inválida.")
      .nullable()
      .optional()
      .or(z.literal("").transform(() => null))
      .transform((v) => v ?? null),
    target_price: money,
    max_price: money,
    notes: text(2000),
    active: z.boolean().default(true),
  })
  .refine((v) => v.target_price === null || v.max_price === null || v.target_price <= v.max_price, {
    message: "O preço-alvo não pode ser maior que o preço máximo.",
    path: ["target_price"],
  });
export type ProductInputType = z.infer<typeof ProductInput>;

export const SourceInput = z
  .object({
    product_url: z.string().trim().min(1, "Informe a URL da oferta.").max(2000),
    store_name: z.string().trim().max(80).optional(),
  })
  .transform((v, ctx) => {
    const check = checkProductUrl(v.product_url);
    if (!check.ok || !check.sourceType || !check.url) {
      ctx.addIssue({ code: "custom", message: check.reason ?? "URL inválida.", path: ["product_url"] });
      return z.NEVER;
    }
    const collector = getCollector(check.sourceType)!;
    const externalId = collector.extractId(check.url.toString());
    if (!externalId) {
      ctx.addIssue({
        code: "custom",
        message: "Não encontramos o código do anúncio (MLB...) nessa URL. Abra a página do produto e copie o link completo.",
        path: ["product_url"],
      });
      return z.NEVER;
    }
    return {
      product_url: check.url.toString(),
      source_type: check.sourceType,
      external_identifier: externalId,
      store_name: v.store_name && v.store_name.length ? v.store_name : collector.label,
    };
  });

export const RuleInput = z
  .object({
    rule_type: z.enum(RULE_TYPES),
    threshold: z
      .union([z.string(), z.number(), z.null()])
      .optional()
      .transform((v) => (v === null || v === undefined || v === "" ? null : Number(String(v).replace(",", "."))))
      .refine((v) => v === null || (Number.isFinite(v) && v > 0), "Informe um número positivo."),
    cooldown_hours: z.coerce.number().int().min(0).max(720).default(24),
  })
  .superRefine((v, ctx) => {
    if ((v.rule_type === "percent_drop" || v.rule_type === "abs_change") && v.threshold === null) {
      ctx.addIssue({ code: "custom", message: "Esta regra precisa de um valor de referência.", path: ["threshold"] });
    }
    if (v.rule_type === "percent_drop" && v.threshold !== null && v.threshold >= 100) {
      ctx.addIssue({ code: "custom", message: "A queda percentual deve ser menor que 100.", path: ["threshold"] });
    }
  });

export const CategoryInput = z.object({ name: z.string().trim().min(2, "Informe um nome.").max(60) });

export const SettingsInput = z.object({
  email_enabled: z.boolean(),
  email_to: z
    .string()
    .trim()
    .max(300)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .refine(
      (v) => v === null || v.split(/[,;]/).every((e) => z.string().email().safeParse(e.trim()).success),
      "Informe e-mails válidos separados por vírgula.",
    ),
  telegram_enabled: z.boolean(),
  telegram_chat_id: z
    .string()
    .trim()
    .max(40)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .refine((v) => v === null || /^-?\d+$|^@[A-Za-z0-9_]{5,}$/.test(v), "Chat id inválido (número ou @canal)."),
  whatsapp_enabled: z.boolean(),
  whatsapp_to: z
    .string()
    .trim()
    .max(20)
    .transform((v) => (v === "" ? null : v.replace(/\D/g, "")))
    .nullable()
    .refine((v) => v === null || /^\d{10,15}$/.test(v), "Use o formato internacional, ex.: 5511999998888."),
  daily_summary_enabled: z.boolean(),
  alerts_enabled: z.boolean(),
  only_relevant: z.boolean(),
  stale_after_hours: z.coerce.number().int().min(1).max(720),
});

/** Converte FormData em objeto simples (checkbox → boolean). */
export function formToObject(form: FormData, booleans: string[] = []): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") obj[k] = v;
  for (const b of booleans) obj[b] = form.get(b) === "on" || form.get(b) === "true";
  return obj;
}

export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Dados inválidos.";
}
