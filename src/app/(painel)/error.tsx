"use client";

import { buttonClass } from "@/components/ui";

/**
 * Tela de erro do painel (Error Boundary do Next). Precisa ser Client Component.
 * Não mostramos a mensagem técnica: em produção o Next a esconde de propósito;
 * o `digest` é o código que aparece nos logs da Vercel para achar o erro.
 */
export default function PainelError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="max-w-xl rounded-xl border border-up/40 bg-up-bg p-5 text-up">
      <p className="font-semibold">Algo deu errado ao montar esta página.</p>
      <p className="mt-1 text-sm">
        {error.digest ? `Código para procurar nos logs: ${error.digest}. ` : ""}Tente de novo; se persistir, confira os logs do
        servidor.
      </p>
      <button onClick={reset} className={`${buttonClass.secondary} mt-4`}>
        Tentar de novo
      </button>
    </div>
  );
}
