import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import { BRAND } from "@/lib/brand";
import { parseTheme, THEME_COOKIE } from "@/lib/ui-prefs";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: BRAND.name, template: `%s · ${BRAND.name}` },
  description: BRAND.description,
  applicationName: BRAND.name,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#15171b" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Lido no servidor para o HTML já sair com o tema certo (sem piscar).
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="pt-BR" data-theme={theme === "system" ? undefined : theme}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
