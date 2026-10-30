"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconHistory, IconOverview, IconSliders, IconTag } from "../icons";

/** Só entram aqui páginas que existem e funcionam. */
export const NAV_ITEMS = [
  { href: "/", label: "Visão geral", icon: IconOverview },
  { href: "/produtos", label: "Produtos monitorados", icon: IconTag },
  { href: "/execucoes", label: "Coletas e envios", icon: IconHistory },
  { href: "/configuracoes", label: "Configurações", icon: IconSliders },
] as const;

/** "/" só fica ativo na própria raiz; os demais também valem para subpáginas. */
export function isActivePath(href: string, path: string): boolean {
  return href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
}

export function NavList({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav aria-label="Navegação principal">
      <ul className="space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActivePath(href, path);
          return (
            <li key={href}>
              <Link
                href={href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                title={collapsed ? label : undefined}
                className={`group relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-150 ${
                  active ? "bg-rail-raised text-rail-ink" : "text-rail-muted hover:bg-rail-raised/60 hover:text-rail-ink"
                } ${collapsed ? "justify-center px-0" : ""}`}
              >
                {/* Filete dourado: o único uso "decorativo" do acento no menu. */}
                <span
                  aria-hidden="true"
                  className={`absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent transition-opacity duration-150 ${active ? "opacity-100" : "opacity-0"}`}
                />
                <Icon className={active ? "text-accent" : ""} />
                <span className={collapsed ? "sr-only" : ""}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
