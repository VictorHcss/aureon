"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { logout } from "@/app/actions";
import { BRAND } from "@/lib/brand";
import { prefCookie, SIDEBAR_COOKIE, type Theme } from "@/lib/ui-prefs";
import { AureonMark, IconChevronLeft, IconClose, IconLogout, IconMenu } from "../icons";
import { NavList } from "./nav-list";
import { ThemeToggle } from "./theme-toggle";

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5 rounded-lg" aria-label={`${BRAND.name}, visão geral`}>
      <AureonMark />
      {compact ? null : (
        <span className="leading-tight">
          <span className="block text-[1.05rem] font-semibold tracking-tight text-rail-ink">{BRAND.name}</span>
          <span className="block text-xs text-rail-muted">{BRAND.tagline}</span>
        </span>
      )}
    </Link>
  );
}

function LogoutButton({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <form action={logout}>
      <button
        className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-rail-muted transition-colors duration-150 hover:bg-rail-raised hover:text-rail-ink ${collapsed ? "justify-center px-0" : ""}`}
        title={collapsed ? "Sair" : undefined}
      >
        <IconLogout />
        <span className={collapsed ? "sr-only" : ""}>Sair</span>
      </button>
    </form>
  );
}

/**
 * Moldura do painel: menu lateral (desktop), barra superior e gaveta (celular).
 * É um Client Component porque guarda estado (menu recolhido, gaveta aberta);
 * as páginas continuam sendo Server Components, passadas como `children`.
 */
export function AppShell({ children, initialCollapsed, theme }: { children: ReactNode; initialCollapsed: boolean; theme: Theme }) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [currentTheme, setCurrentTheme] = useState<Theme>(theme);
  const drawer = useRef<HTMLDialogElement>(null);
  const path = usePathname();

  // Fecha a gaveta quando a rota muda (ex.: voltar do navegador).
  useEffect(() => {
    drawer.current?.close();
  }, [path]);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = prefCookie(SIDEBAR_COOKIE, next ? "collapsed" : "expanded");
  }

  return (
    <div className="min-h-dvh lg:flex">
      {/* Link escondido que aparece no primeiro Tab: pula o menu e vai direto ao conteúdo. */}
      <a
        href="#conteudo"
        className="sr-only z-50 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Pular para o conteúdo
      </a>
      {/* Menu lateral — telas grandes */}
      <aside
        className={`hidden shrink-0 flex-col border-r border-rail-line bg-rail px-3 py-5 transition-[width] duration-200 lg:sticky lg:top-0 lg:flex lg:h-dvh ${
          collapsed ? "w-[4.5rem]" : "w-64"
        }`}
      >
        <div className={`mb-8 ${collapsed ? "flex justify-center" : "px-1"}`}>
          <Brand compact={collapsed} />
        </div>
        <NavList collapsed={collapsed} />
        <div className="mt-auto space-y-1 border-t border-rail-line pt-4">
          <div className={collapsed ? "flex justify-center" : "flex items-center justify-between px-1"}>
            {collapsed ? null : <span className="text-xs text-rail-muted">Sessão de administrador</span>}
            <ThemeToggle theme={currentTheme} onChange={setCurrentTheme} />
          </div>
          <LogoutButton collapsed={collapsed} />
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm text-rail-muted transition-colors duration-150 hover:bg-rail-raised hover:text-rail-ink ${collapsed ? "justify-center px-0" : ""}`}
          >
            <IconChevronLeft className={`transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`} />
            <span className={collapsed ? "sr-only" : ""}>{collapsed ? "Expandir menu" : "Recolher menu"}</span>
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra superior — celular e tablet */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-rail-line bg-rail px-2 sm:px-4 lg:hidden">
          <button
            type="button"
            onClick={() => drawer.current?.showModal()}
            className="inline-flex size-11 items-center justify-center rounded-lg text-rail-ink hover:bg-rail-raised"
            aria-haspopup="dialog"
          >
            <IconMenu size={20} />
            <span className="sr-only">Abrir menu</span>
          </button>
          <Brand />
          <div className="ml-auto">
            <ThemeToggle theme={currentTheme} onChange={setCurrentTheme} />
          </div>
        </header>

        <main id="conteudo" tabIndex={-1} className="mx-auto w-full outline-none max-w-[90rem] flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
          {/* key = rota: a animação de entrada roda uma vez a cada página, sem animar cada card. */}
          <div key={path} className="animate-enter">
            {children}
          </div>
        </main>
      </div>

      {/* Gaveta do menu — celular e tablet. <dialog> nativo: foco preso, Esc fecha, fundo escurecido. */}
      <dialog
        ref={drawer}
        aria-label="Menu"
        className="drawer border-r border-rail-line bg-rail p-0 lg:hidden"
        onClick={(e) => {
          if (e.target === e.currentTarget) drawer.current?.close(); // clique no fundo
        }}
      >
        <div className="flex h-full flex-col px-3 py-4">
          <div className="mb-6 flex items-center justify-between pl-1">
            <Brand />
            <button
              type="button"
              onClick={() => drawer.current?.close()}
              className="inline-flex size-11 items-center justify-center rounded-lg text-rail-muted hover:bg-rail-raised hover:text-rail-ink"
            >
              <IconClose size={20} />
              <span className="sr-only">Fechar menu</span>
            </button>
          </div>
          <NavList onNavigate={() => drawer.current?.close()} />
          <div className="mt-auto border-t border-rail-line pt-4">
            <p className="mb-2 px-3 text-xs text-rail-muted">Sessão de administrador</p>
            <LogoutButton />
          </div>
        </div>
      </dialog>
    </div>
  );
}
