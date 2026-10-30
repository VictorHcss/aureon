/** Log estruturado em JSON com redação de segredos. */

const SECRET_PATTERNS: RegExp[] = [
  /bot\d+:[A-Za-z0-9_-]{20,}/g, // token do Telegram em URLs
  /(Bearer\s+)[A-Za-z0-9._\-]+/gi,
  /\bAPP_USR-[A-Za-z0-9-]+/g, // tokens do Mercado Livre
  /\bTG-[A-Za-z0-9-]+/g, // refresh tokens do Mercado Livre
  /\bre_[A-Za-z0-9_]{10,}/g, // chaves do Resend
  /\bEAA[A-Za-z0-9]{20,}/g, // tokens da Meta
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // JWT (chaves Supabase)
  /\bsb_secret_[A-Za-z0-9_-]+/g,
];

/** Remove segredos conhecidos de um texto antes de gravar ou exibir. */
export function redact(text: string): string {
  let out = text;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, (match, prefix?: string) =>
      typeof prefix === "string" && /^Bearer/i.test(prefix) ? `${prefix}[redacted]` : "[redacted]",
    );
  }
  return out;
}

/** Mascara telefone/chat id deixando só os últimos dígitos. */
export function maskIdentifier(value: string | null | undefined): string {
  if (!value) return "—";
  const v = value.trim();
  if (v.length <= 4) return "****";
  return `${"*".repeat(Math.min(v.length - 4, 8))}${v.slice(-4)}`;
}

export function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return redact(raw).slice(0, 500);
}

type Level = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
  child(ctx: Record<string, unknown>): Logger;
}

export function createLogger(context: Record<string, unknown> = {}, silent = false): Logger {
  const write = (level: Level, msg: string, data?: Record<string, unknown>) => {
    if (silent) return;
    const line = redact(JSON.stringify({ ts: new Date().toISOString(), level, msg, ...context, ...data }));
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  };
  return {
    debug: (m, d) => write("debug", m, d),
    info: (m, d) => write("info", m, d),
    warn: (m, d) => write("warn", m, d),
    error: (m, d) => write("error", m, d),
    child: (ctx) => createLogger({ ...context, ...ctx }, silent),
  };
}
