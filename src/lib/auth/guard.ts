import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readEnv } from "../env";
import { SESSION_COOKIE, verifySessionValue } from "./session";

export async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  return verifySessionValue(store.get(SESSION_COOKIE)?.value, readEnv().SESSION_SECRET);
}

/** Defesa em profundidade: toda Server Action chama isto, além do middleware. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect("/login");
}
