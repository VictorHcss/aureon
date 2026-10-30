/**
 * Preferências de interface guardadas em cookie (tema e menu recolhido).
 *
 * Por que cookie e não localStorage? O servidor lê o cookie antes de gerar o HTML,
 * então a página já chega com o tema certo — sem o "flash" de tema errado que
 * acontece quando o JavaScript só aplica a preferência depois de carregar.
 * Não são dados sensíveis: nada aqui precisa ser httpOnly.
 */
export const THEME_COOKIE = "aureon-theme";
export const SIDEBAR_COOKIE = "aureon-sidebar";
/** Um ano: preferência de interface deve sobreviver entre sessões. */
export const PREF_MAX_AGE = 60 * 60 * 24 * 365;

export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_LABELS: Record<Theme, string> = {
  system: "Tema do sistema",
  light: "Tema claro",
  dark: "Tema escuro",
};

/** Qualquer valor desconhecido (ou ausente) vira "system". */
export function parseTheme(value: string | undefined | null): Theme {
  return (THEMES as readonly string[]).includes(value ?? "") ? (value as Theme) : "system";
}

/** Ordem do botão: sistema → claro → escuro → sistema. */
export function nextTheme(current: Theme): Theme {
  return THEMES[(THEMES.indexOf(current) + 1) % THEMES.length]!;
}

export function parseSidebarCollapsed(value: string | undefined | null): boolean {
  return value === "collapsed";
}

/** Monta o texto do cookie (lado do cliente). */
export function prefCookie(name: string, value: string): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${PREF_MAX_AGE}; SameSite=Lax`;
}
