"use client";

import { nextTheme, prefCookie, THEME_COOKIE, THEME_LABELS, type Theme } from "@/lib/ui-prefs";
import { IconDevice, IconMoon, IconSun } from "../icons";

const ICONS = { system: IconDevice, light: IconSun, dark: IconMoon } as const;

/**
 * Aplica o tema na hora (sem recarregar) e grava o cookie que o servidor lê
 * nas próximas visitas. A classe "theme-transition" suaviza a troca de cores
 * por ~250 ms e depois é removida, para não deixar transições ligadas o tempo todo.
 */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.add("theme-transition");
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
  document.cookie = prefCookie(THEME_COOKIE, theme);
  window.setTimeout(() => root.classList.remove("theme-transition"), 250);
}

/** Botão que alterna sistema → claro → escuro. Controlado pelo AppShell. */
export function ThemeToggle({ theme, onChange }: { theme: Theme; onChange: (t: Theme) => void }) {
  const Icon = ICONS[theme];
  const next = nextTheme(theme);
  return (
    <button
      type="button"
      onClick={() => {
        applyTheme(next);
        onChange(next);
      }}
      className="inline-flex size-10 items-center justify-center rounded-lg text-rail-muted transition-colors duration-150 hover:bg-rail-raised hover:text-rail-ink"
      title={`${THEME_LABELS[theme]}. Clique para usar o ${THEME_LABELS[next].toLowerCase()}.`}
    >
      <Icon />
      <span className="sr-only">
        {THEME_LABELS[theme]} ativo. Mudar para {THEME_LABELS[next].toLowerCase()}.
      </span>
    </button>
  );
}
