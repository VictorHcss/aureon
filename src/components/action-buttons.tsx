"use client";

import { unstable_rethrow } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import type { ActionState } from "@/app/actions";
import { buttonClass } from "./ui";

type AnyAction = () => Promise<void | ActionState>;

/**
 * Executa uma Server Action e traduz o resultado em mensagem.
 * `unstable_rethrow` devolve ao Next os "erros" de controle (redirect, notFound):
 * sem isso, um redirect para /login com sessão expirada apareceria como "NEXT_REDIRECT".
 */
async function runSafely(action: AnyAction): Promise<ActionState | null> {
  try {
    return (await action()) ?? null;
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false, error: e instanceof Error ? e.message : "Falhou." };
  }
}

/** Botão com diálogo de confirmação para ações destrutivas. */
export function ConfirmAction({
  action, label, title, description, confirmLabel, variant = "danger",
}: {
  action: AnyAction;
  label: string;
  title: string;
  description: string;
  confirmLabel: string;
  variant?: keyof typeof buttonClass;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  return (
    <>
      <button
        type="button"
        className={buttonClass[variant]}
        onClick={() => {
          setError(null);
          ref.current?.showModal();
        }}
      >
        {label}
      </button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-0 shadow-pop"
        onClick={(e) => {
          if (e.target === e.currentTarget && !pending) ref.current?.close();
        }}
      >
        <div className="p-5 sm:p-6">
          <h2 id={titleId} className="text-base font-semibold">
            {title}
          </h2>
          <p className="mt-2 text-sm text-muted">{description}</p>
          {error ? (
            <p role="alert" className="mt-3 text-sm text-up">
              {error}
            </p>
          ) : null}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className={buttonClass.secondary} onClick={() => ref.current?.close()} disabled={pending}>
              Cancelar
            </button>
            <button
              type="button"
              className={buttonClass.destructive}
              disabled={pending}
              aria-busy={pending}
              onClick={() =>
                start(async () => {
                  const r = await runSafely(action);
                  if (r && !r.ok) setError(r.error ?? "Falhou.");
                  else ref.current?.close();
                })
              }
            >
              {pending ? "Aguarde…" : confirmLabel}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

/** Botão simples que executa uma Server Action e mostra o resultado ao lado. */
export function RunAction({ action, label, pendingLabel, variant = "secondary" }: {
  action: AnyAction;
  label: string;
  pendingLabel?: string;
  variant?: keyof typeof buttonClass;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionState | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <button
        type="button"
        className={buttonClass[variant]}
        disabled={pending}
        aria-busy={pending}
        onClick={() =>
          start(async () => {
            setResult(await runSafely(action));
          })
        }
      >
        {pending ? (pendingLabel ?? "Aguarde…") : label}
      </button>
      {result && (result.message || result.error) ? (
        <span role={result.ok ? "status" : "alert"} className={`text-xs ${result.ok ? "text-down" : "text-up"}`}>
          {result.ok ? result.message : result.error}
        </span>
      ) : null}
    </span>
  );
}
