import type { Metadata } from "next";

export const metadata: Metadata = { title: "Autorização do Mercado Livre", referrer: "no-referrer", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Página de retorno do OAuth do Mercado Livre. Apenas exibe o código para
 * ser usado em `npm run ml:auth -- --code=...`. Ela não troca o código por
 * tokens: isso exige o client_secret, que fica só no seu computador/servidor.
 */
export default async function MlCallback({ searchParams }: { searchParams: Promise<{ code?: string; error?: string }> }) {
  const { code, error } = await searchParams;
  const valid = typeof code === "string" && /^[A-Za-z0-9-]{10,200}$/.test(code);
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-xl border border-line bg-surface p-6 shadow-card">
        <h1 className="text-xl font-semibold">Autorização do Mercado Livre</h1>
        {valid ? (
          <>
            <p className="mt-2 text-sm text-muted">Copie o comando abaixo e rode na pasta do projeto em até 10 minutos. O código vale uma única vez.</p>
            <pre className="mt-4 overflow-x-auto rounded-lg bg-sunken p-3 text-sm">npm run ml:auth -- --code={code}</pre>
          </>
        ) : (
          <p role="alert" className="mt-2 text-sm text-up">
            {error ? `O Mercado Livre recusou a autorização (${error.slice(0, 80)}).` : "Nenhum código recebido."} Rode{" "}
            <code>npm run ml:auth</code> e abra o link de novo.
          </p>
        )}
      </div>
    </main>
  );
}
