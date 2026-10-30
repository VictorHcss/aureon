import Link from "next/link";
import { AureonMark } from "@/components/icons";
import { buttonClass } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <AureonMark size={40} />
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Página não encontrada</h1>
      <p className="mt-2 max-w-sm text-sm text-muted">O endereço não existe ou o produto foi excluído.</p>
      <Link href="/" className={`${buttonClass.primary} mt-6`}>
        Voltar para a visão geral
      </Link>
    </main>
  );
}
