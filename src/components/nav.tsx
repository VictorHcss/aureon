"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Visão geral" },
  { href: "/produtos", label: "Produtos" },
  { href: "/execucoes", label: "Coletas e envios" },
  { href: "/configuracoes", label: "Configurações" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav aria-label="Navegação principal" className="flex gap-1 overflow-x-auto md:flex-col">
      {LINKS.map((l) => {
        const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium ${
              active ? "bg-accent text-accent-ink" : "text-ink hover:bg-sunken"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
