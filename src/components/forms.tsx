"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/actions";
import { addCategory, addRule, addSource, login, saveProduct, saveSettings } from "@/app/actions";
import type { Category, NotificationSettings, Product } from "@/lib/types";
import { RULE_LABELS, RULE_TYPES } from "@/lib/types";
import { buttonClass } from "./ui";

const initial: ActionState = { ok: false };

/**
 * Botão de envio. `useFormStatus` sabe se o <form> pai está enviando:
 * enquanto isso, o botão fica desabilitado (evita envio duplicado).
 */
export function Submit({
  children, variant = "primary", pendingLabel = "Salvando…", className = "",
}: { children: React.ReactNode; variant?: keyof typeof buttonClass; pendingLabel?: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`${buttonClass[variant]} ${className}`} disabled={pending} aria-busy={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (state.error)
    return (
      <p role="alert" className="text-sm text-up">
        {state.error}
      </p>
    );
  if (state.ok && state.message)
    return (
      <p role="status" className="text-sm text-down">
        {state.message}
      </p>
    );
  return null;
}

function useResetOnSuccess(state: ActionState) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return ref;
}

export function LoginForm() {
  const [state, action] = useActionState(login, initial);
  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="lbl">Senha do painel</span>
        <input type="password" name="password" required autoComplete="current-password" autoFocus />
      </label>
      <FormMessage state={state} />
      <Submit pendingLabel="Entrando…" className="w-full">
        Entrar no painel
      </Submit>
    </form>
  );
}

const fmtMoneyInput = (v: number | null) => (v === null ? "" : v.toFixed(2).replace(".", ","));

export function ProductForm({ product, categories }: { product?: Product; categories: Category[] }) {
  const [state, action] = useActionState(saveProduct, initial);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      {product ? <input type="hidden" name="id" value={product.id} /> : null}
      <label className="sm:col-span-2">
        <span className="lbl">Nome do produto *</span>
        <input name="name" required maxLength={160} defaultValue={product?.name} placeholder="Ex.: SSD Kingston NV2 1TB NVMe" />
      </label>
      <label>
        <span className="lbl">Marca</span>
        <input name="brand" maxLength={80} defaultValue={product?.brand ?? ""} />
      </label>
      <label>
        <span className="lbl">Modelo</span>
        <input name="model" maxLength={120} defaultValue={product?.model ?? ""} />
      </label>
      <label>
        <span className="lbl">Categoria</span>
        <select name="category_id" defaultValue={product?.category_id ?? ""}>
          <option value="">Sem categoria</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-4">
        <label>
          <span className="lbl">Preço-alvo (R$)</span>
          <input name="target_price" inputMode="decimal" defaultValue={fmtMoneyInput(product?.target_price ?? null)} placeholder="399,90" />
        </label>
        <label>
          <span className="lbl">Preço máximo (R$)</span>
          <input name="max_price" inputMode="decimal" defaultValue={fmtMoneyInput(product?.max_price ?? null)} />
        </label>
      </div>
      <label className="sm:col-span-2">
        <span className="lbl">Observações</span>
        <textarea name="notes" rows={3} maxLength={2000} defaultValue={product?.notes ?? ""} />
      </label>
      <label className="flex min-h-11 items-center gap-2.5 sm:col-span-2">
        <input type="checkbox" name="active" defaultChecked={product?.active ?? true} />
        <span className="text-sm">Monitorar este produto nas coletas diárias</span>
      </label>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:col-span-2">
        <Submit>{product ? "Salvar alterações" : "Cadastrar produto"}</Submit>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function SourceForm({ productId }: { productId: string }) {
  const [state, action] = useActionState(addSource, initial);
  const ref = useResetOnSuccess(state);
  return (
    <form ref={ref} action={action} className="space-y-3">
      <input type="hidden" name="product_id" value={productId} />
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
        <label>
          <span className="lbl">Link da oferta no Mercado Livre</span>
          <input name="product_url" type="url" required placeholder="https://produto.mercadolivre.com.br/MLB-…" />
        </label>
        <label>
          <span className="lbl">Nome exibido (opcional)</span>
          <input name="store_name" maxLength={80} placeholder="Mercado Livre" />
        </label>
      </div>
      <p className="text-xs text-muted">
        Cadastre só ofertas do mesmo modelo, capacidade e condição (novo/usado). Links de catálogo (/p/MLB…) seguem a oferta
        vencedora, que pode trocar de vendedor.
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Submit variant="secondary" pendingLabel="Adicionando…">Adicionar oferta</Submit>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function RuleForm({ productId }: { productId: string }) {
  const [state, action] = useActionState(addRule, initial);
  const ref = useResetOnSuccess(state);
  return (
    <form ref={ref} action={action} className="space-y-3">
      <input type="hidden" name="product_id" value={productId} />
      <div className="grid gap-3 sm:grid-cols-[1fr_9rem_9rem]">
        <label>
          <span className="lbl">Avisar quando</span>
          <select name="rule_type" defaultValue="target_price">
            {RULE_TYPES.map((t) => (
              <option key={t} value={t}>
                {RULE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="lbl">Valor</span>
          <input name="threshold" inputMode="decimal" placeholder="opcional" />
        </label>
        <label>
          <span className="lbl">Espera (horas)</span>
          <input name="cooldown_hours" type="number" min={0} max={720} defaultValue={24} />
        </label>
      </div>
      <p className="text-xs text-muted">
        Valor: preço-alvo em R$ (vazio usa o alvo do produto), queda em %, variação em R$ ou horas sem atualização. A espera
        evita avisos repetidos da mesma regra.
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Submit variant="secondary" pendingLabel="Criando…">Criar regra</Submit>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function CategoryForm() {
  const [state, action] = useActionState(addCategory, initial);
  const ref = useResetOnSuccess(state);
  return (
    <form ref={ref} action={action} className="flex flex-wrap items-end gap-3">
      <label className="min-w-48 flex-1">
        <span className="lbl">Nova categoria</span>
        <input name="name" required maxLength={60} />
      </label>
      <Submit variant="secondary" pendingLabel="Adicionando…">Adicionar</Submit>
      <FormMessage state={state} />
    </form>
  );
}

export function SettingsForm({ settings }: { settings: NotificationSettings }) {
  const [state, action] = useActionState(saveSettings, initial);
  const check = (name: keyof NotificationSettings, label: string, hint?: string) => (
    <label className="flex items-start gap-2.5 py-1">
      <input type="checkbox" name={name} defaultChecked={Boolean(settings[name])} className="mt-1" />
      <span className="text-sm">
        {label}
        {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
      </span>
    </label>
  );
  return (
    <form action={action} className="space-y-7">
      <fieldset className="grid min-w-0 gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-semibold">E-mail (Resend)</legend>
        {check("email_enabled", "Enviar por e-mail")}
        <label>
          <span className="lbl">Destinatários</span>
          <input name="email_to" defaultValue={settings.email_to ?? ""} placeholder="voce@exemplo.com" />
        </label>
      </fieldset>
      <fieldset className="grid min-w-0 gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-semibold">Telegram</legend>
        {check("telegram_enabled", "Enviar pelo Telegram")}
        <label>
          <span className="lbl">Chat id</span>
          <input name="telegram_chat_id" defaultValue={settings.telegram_chat_id ?? ""} placeholder="123456789" />
        </label>
      </fieldset>
      <fieldset className="grid min-w-0 gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-semibold">WhatsApp (opcional)</legend>
        {check("whatsapp_enabled", "Enviar pelo WhatsApp", "Exige conta na WhatsApp Cloud API e modelo aprovado.")}
        <label>
          <span className="lbl">Número de destino</span>
          <input name="whatsapp_to" defaultValue={settings.whatsapp_to ?? ""} placeholder="5511999998888" />
        </label>
      </fieldset>
      <fieldset className="grid min-w-0 gap-3">
        <legend className="mb-3 text-sm font-semibold">O que enviar</legend>
        {check("daily_summary_enabled", "Resumo diário", "Enviado depois da coleta das 8h (horário de Brasília).")}
        {check("alerts_enabled", "Alertas das regras de cada produto")}
        {check("only_relevant", "Só oportunidades", "Ignora avisos operacionais, como dados desatualizados e variações em R$.")}
        <label className="max-w-xs">
          <span className="lbl">Considerar desatualizado após (horas)</span>
          <input name="stale_after_hours" type="number" min={1} max={720} defaultValue={settings.stale_after_hours} />
        </label>
      </fieldset>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Submit>Salvar configurações</Submit>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
