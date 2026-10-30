import { describe, expect, it } from "vitest";
import { nextTheme, parseSidebarCollapsed, parseTheme, prefCookie, THEME_COOKIE } from "@/lib/ui-prefs";
import { isActivePath } from "@/components/layout/nav-list";

describe("preferências de interface", () => {
  it("aceita só temas conhecidos; o resto vira 'system'", () => {
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme(undefined)).toBe("system");
    expect(parseTheme("<script>")).toBe("system");
  });

  it("o botão percorre sistema → claro → escuro → sistema", () => {
    expect(nextTheme("system")).toBe("light");
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("system");
  });

  it("menu recolhido só com o valor exato", () => {
    expect(parseSidebarCollapsed("collapsed")).toBe(true);
    expect(parseSidebarCollapsed("expanded")).toBe(false);
    expect(parseSidebarCollapsed(undefined)).toBe(false);
  });

  it("cookie de preferência vale para o site todo e dura um ano", () => {
    const c = prefCookie(THEME_COOKIE, "dark");
    expect(c).toContain("aureon-theme=dark");
    expect(c).toContain("Path=/");
    expect(c).toContain("SameSite=Lax");
    expect(c).toMatch(/Max-Age=31536000/);
  });
});

describe("item ativo do menu", () => {
  it("'/' só na raiz", () => {
    expect(isActivePath("/", "/")).toBe(true);
    expect(isActivePath("/", "/produtos")).toBe(false);
  });
  it("seções valem para as subpáginas, mas não para prefixos parecidos", () => {
    expect(isActivePath("/produtos", "/produtos")).toBe(true);
    expect(isActivePath("/produtos", "/produtos/123")).toBe(true);
    expect(isActivePath("/produtos", "/produtos-antigos")).toBe(false);
  });
});
