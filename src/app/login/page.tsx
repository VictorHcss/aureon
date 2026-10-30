import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/forms";
import { AureonMark } from "@/components/icons";
import { isAdmin } from "@/lib/auth/guard";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: "Entrar" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await isAdmin()) redirect("/");
  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* Painel da marca — só em telas grandes */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-rail p-12 text-rail-ink lg:flex">
        <div className="flex items-center gap-3">
          <AureonMark size={36} />
          <span className="text-lg font-semibold tracking-tight">{BRAND.name}</span>
        </div>
        <div className="max-w-md">
          <p className="text-3xl leading-tight font-semibold tracking-tight text-balance">
            O preço certo aparece. O Aureon avisa você.
          </p>
          <p className="mt-4 text-sm text-rail-muted">
            Coleta diária, histórico de cada oferta e alertas quando o valor atinge o seu alvo.
          </p>
        </div>
        {/* Linha de preço decorativa: desce até o ponto dourado (o "achado"). */}
        <svg aria-hidden="true" viewBox="0 0 400 120" className="pointer-events-none absolute right-0 bottom-28 w-[70%] opacity-60">
          <path d="M0 30 H70 V48 H140 V40 H210 V78 H280 V96" fill="none" stroke="#3b4049" strokeWidth="2" />
          <path d="M280 96 H400" fill="none" stroke="#f59e0b" strokeWidth="2" />
          <circle cx="280" cy="96" r="5" fill="#f59e0b" />
        </svg>
        <p className="text-xs text-rail-muted">Painel privado de uso pessoal.</p>
      </section>

      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <AureonMark size={36} />
            <span className="text-lg font-semibold tracking-tight">{BRAND.name}</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Entrar no painel</h1>
          <p className="mt-1.5 mb-7 text-sm text-muted">Use a senha definida na variável ADMIN_PASSWORD.</p>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
