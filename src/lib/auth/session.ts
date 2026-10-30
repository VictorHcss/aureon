/**
 * Sessão do administrador: cookie assinado com HMAC-SHA256 (Web Crypto),
 * compatível com o middleware (Edge) e com o Node.
 * Formato do valor: "<expiraEmMs>.<assinaturaBase64url>"
 */
export const SESSION_COOKIE = "mp_session";
export const SESSION_TTL_MS = 7 * 24 * 3_600_000;

const encoder = new TextEncoder();

function toBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toBase64Url(await crypto.subtle.sign("HMAC", key, encoder.encode(data)));
}

/** Comparação em tempo constante. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function assertSecret(secret: string | undefined): asserts secret is string {
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET ausente ou curto demais (mínimo 32 caracteres).");
  }
}

export async function createSessionValue(secret: string, now = Date.now()): Promise<string> {
  assertSecret(secret);
  const exp = String(now + SESSION_TTL_MS);
  return `${exp}.${await hmac(secret, `admin:${exp}`)}`;
}

export async function verifySessionValue(value: string | undefined, secret: string | undefined, now = Date.now()): Promise<boolean> {
  if (!value || !secret || secret.length < 32) return false;
  const [exp, sig] = value.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp)) return false;
  if (Number(exp) < now) return false;
  return safeEqual(sig, await hmac(secret, `admin:${exp}`));
}

/** Compara senhas via HMAC para não vazar tamanho/tempo. */
export async function passwordMatches(input: string, expected: string | undefined, secret: string): Promise<boolean> {
  if (!expected) return false;
  return safeEqual(await hmac(secret, `pw:${input}`), await hmac(secret, `pw:${expected}`));
}
