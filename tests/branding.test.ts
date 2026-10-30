/** Garante que o nome antigo não voltou para a interface nem para as mensagens. */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BRAND } from "@/lib/brand";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|svg)$/.test(f) ? [p] : [];
  });
}

describe("identidade Aureon", () => {
  it("o nome oficial é Aureon", () => {
    expect(BRAND.name).toBe("Aureon");
  });
  // brand.ts é a exceção: "Monitor de preços" ali é a descrição do produto, abaixo do nome.
  it("nenhum arquivo de src/ usa o nome antigo como marca", () => {
    const offenders = files(path.resolve(__dirname, "../src")).filter((f) => !f.endsWith("brand.ts")).filter((f) => /Monitor de [Pp]re[çc]os/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
