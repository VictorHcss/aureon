import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionValue } from "@/lib/auth/session";

/** Todo o painel exige sessão de administrador, exceto a tela de login. */
export async function middleware(req: NextRequest) {
  const ok = await verifySessionValue(req.cookies.get(SESSION_COOKIE)?.value, process.env.SESSION_SECRET);
  if (ok) return NextResponse.next();
  if (req.method !== "GET") return new NextResponse("Não autorizado", { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|ml-callback|_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
