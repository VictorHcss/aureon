"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/guard";
import { assertSecret, createSessionValue, passwordMatches, SESSION_COOKIE, SESSION_TTL_MS } from "@/lib/auth/session";
import { getServiceClient } from "@/lib/db/client";
import { readEnv } from "@/lib/env";
import { createJobContext } from "@/lib/jobs/context";
import { runCollection } from "@/lib/jobs/collect";
import { createLogger, errorMessage } from "@/lib/logger";
import { deliver } from "@/lib/notify/dispatcher";
import { buildSenders } from "@/lib/notify/senders";
import { allow } from "@/lib/rate-limit";
import { renderTestMessage } from "@/lib/reports/render";
import type { Channel } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";
import { CategoryInput, firstError, formToObject, ProductInput, RuleInput, SettingsInput, SourceInput } from "@/lib/validation";

export interface ActionState {
  ok: boolean;
  error?: string;
  message?: string;
}

const UNIQUE = "23505";
const db = () => getServiceClient();

function fail(error: unknown): ActionState {
  return { ok: false, error: errorMessage(error) };
}

// ---------------------------------------------------------------- sessão
export async function login(_: ActionState, form: FormData): Promise<ActionState> {
  const env = readEnv();
  try {
    assertSecret(env.SESSION_SECRET);
  } catch (e) {
    return fail(e);
  }
  if (!env.ADMIN_PASSWORD) return { ok: false, error: "Defina ADMIN_PASSWORD nas variáveis de ambiente." };
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!allow(`login:${ip}`, 5, 15 * 60_000)) {
    return { ok: false, error: "Muitas tentativas. Aguarde 15 minutos e tente de novo." };
  }
  const password = String(form.get("password") ?? "");
  if (!(await passwordMatches(password, env.ADMIN_PASSWORD, env.SESSION_SECRET))) {
    await new Promise((r) => setTimeout(r, 400));
    return { ok: false, error: "Senha incorreta." };
  }
  (await cookies()).set(SESSION_COOKIE, await createSessionValue(env.SESSION_SECRET), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  redirect("/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

// ---------------------------------------------------------------- produtos
export async function saveProduct(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = String(form.get("id") ?? "") || null;
  const parsed = ProductInput.safeParse(formToObject(form, ["active"]));
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  let newId = id;
  try {
    if (id) {
      const { error } = await db().from("products").update(parsed.data).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { data, error } = await db().from("products").insert(parsed.data).select("id").single();
      if (error) throw new Error(error.message);
      newId = data.id as string;
    }
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/", "layout");
  if (!id) redirect(`/produtos/${newId}?novo=1`);
  return { ok: true, message: "Alterações salvas." };
}

export async function setProductArchived(id: string, archived: boolean) {
  await requireAdmin();
  const { error } = await db().from("products").update({ archived_at: archived ? new Date().toISOString() : null }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

export async function setProductActive(id: string, active: boolean) {
  await requireAdmin();
  const { error } = await db().from("products").update({ active }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

export async function deleteProduct(id: string) {
  await requireAdmin();
  const { error } = await db().from("products").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
  redirect("/produtos");
}

// ---------------------------------------------------------------- fontes
export async function addSource(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const productId = String(form.get("product_id") ?? "");
  const parsed = SourceInput.safeParse(formToObject(form));
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const { error } = await db().from("product_sources").insert({ ...parsed.data, product_id: productId });
  if (error?.code === UNIQUE) return { ok: false, error: "Esta oferta já está cadastrada para o produto." };
  if (error) return fail(error.message);
  revalidatePath(`/produtos/${productId}`);
  return { ok: true, message: "Oferta adicionada. Use “Consultar agora” para buscar o preço." };
}

export async function setSourceActive(id: string, productId: string, active: boolean) {
  await requireAdmin();
  const { error } = await db().from("product_sources").update({ active }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/produtos/${productId}`);
}

export async function deleteSource(id: string, productId: string) {
  await requireAdmin();
  const { error } = await db().from("product_sources").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/produtos/${productId}`);
}

export async function collectSourceNow(id: string, productId: string): Promise<ActionState> {
  await requireAdmin();
  if (!allow(`collect:${id}`, 1, 60_000) || !allow("collect:any", 10, 60_000)) {
    return { ok: false, error: "Aguarde um minuto antes de consultar de novo." };
  }
  try {
    const logger = createLogger({ trigger: "panel" });
    const { repo, collectorCtx } = createJobContext(logger);
    const out = await runCollection({ repo, ctx: collectorCtx, logger, trigger: "panel", runKey: null, sourceIds: [id] });
    revalidatePath(`/produtos/${productId}`);
    revalidatePath("/", "layout");
    const r = out.results[0];
    if (!r) return { ok: false, error: "Oferta inativa ou produto arquivado/pausado." };
    if (r.status === "success") return { ok: true, message: "Preço atualizado." };
    return { ok: false, error: `${STATUS_LABELS[r.status]}: ${r.error ?? ""}` };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- regras
export async function addRule(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const productId = String(form.get("product_id") ?? "");
  const parsed = RuleInput.safeParse(formToObject(form));
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const { error } = await db().from("alert_rules").insert({ ...parsed.data, product_id: productId });
  if (error) return fail(error.message);
  revalidatePath(`/produtos/${productId}`);
  return { ok: true, message: "Regra criada." };
}

export async function setRuleActive(id: string, productId: string, active: boolean) {
  await requireAdmin();
  const { error } = await db().from("alert_rules").update({ active }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/produtos/${productId}`);
}

export async function deleteRule(id: string, productId: string) {
  await requireAdmin();
  const { error } = await db().from("alert_rules").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/produtos/${productId}`);
}

// ---------------------------------------------------------------- categorias e configurações
export async function addCategory(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = CategoryInput.safeParse(formToObject(form));
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const { error } = await db().from("categories").insert(parsed.data);
  if (error?.code === UNIQUE) return { ok: false, error: "Essa categoria já existe." };
  if (error) return fail(error.message);
  revalidatePath("/", "layout");
  return { ok: true, message: "Categoria criada." };
}

export async function saveSettings(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = SettingsInput.safeParse(
    formToObject(form, ["email_enabled", "telegram_enabled", "whatsapp_enabled", "daily_summary_enabled", "alerts_enabled", "only_relevant"]),
  );
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const { error } = await db().from("notification_settings").update(parsed.data).eq("id", 1);
  if (error) return fail(error.message);
  revalidatePath("/configuracoes");
  return { ok: true, message: "Configurações salvas." };
}

export async function sendTest(channel: Channel): Promise<ActionState> {
  await requireAdmin();
  if (!allow(`test:${channel}`, 3, 10 * 60_000)) return { ok: false, error: "Limite de testes atingido. Tente em 10 minutos." };
  try {
    const logger = createLogger({ trigger: "panel-test" });
    const { env, repo } = createJobContext(logger);
    const settings = await repo.getSettings();
    const forced = { ...settings, email_enabled: channel === "email", telegram_enabled: channel === "telegram", whatsapp_enabled: channel === "whatsapp" };
    const senders = buildSenders(env, forced, fetch, logger);
    if (!senders.length) return { ok: false, error: "Canal sem credenciais ou destino. Confira as variáveis de ambiente e o destino salvo acima." };
    const [result] = await deliver({ repo, senders, kind: "test", eventKey: `test:${channel}:${Date.now()}`, message: renderTestMessage(), logger });
    revalidatePath("/execucoes");
    return result?.status === "sent" ? { ok: true, message: "Mensagem de teste enviada." } : { ok: false, error: result?.error ?? "Falha no envio." };
  } catch (e) {
    return fail(e);
  }
}
