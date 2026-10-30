import { cookies } from "next/headers";
import { AppShell } from "@/components/layout/app-shell";
import { requireAdmin } from "@/lib/auth/guard";
import { parseSidebarCollapsed, parseTheme, SIDEBAR_COOKIE, THEME_COOKIE } from "@/lib/ui-prefs";

export const dynamic = "force-dynamic";

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const store = await cookies();
  return (
    <AppShell
      initialCollapsed={parseSidebarCollapsed(store.get(SIDEBAR_COOKIE)?.value)}
      theme={parseTheme(store.get(THEME_COOKIE)?.value)}
    >
      {children}
    </AppShell>
  );
}
