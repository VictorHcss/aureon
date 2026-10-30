import type { NextConfig } from "next";

/**
 * Cabeçalhos de segurança enviados em todas as respostas.
 *
 * A Content-Security-Policy abaixo é propositalmente "parcial": ela trava
 * molduras (clickjacking), plugins, a tag <base> e o destino de formulários,
 * mas não restringe scripts — o Next injeta scripts inline e uma política de
 * scripts exigiria nonce em toda página. Ver docs/02-arquitetura.md.
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
  // Navegadores ignoram HSTS em http://localhost; em produção (https) força HTTPS por 2 anos.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
