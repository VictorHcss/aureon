import { describe, expect, it } from "vitest";
import { buildAuthorizationUrl, createMlTokenProvider, exchangeAuthorizationCode } from "@/lib/collectors/mercadolivre-auth";
import { createLogger } from "@/lib/logger";
import { MemoryRepository, json, mockFetch } from "./helpers/memory-repository";

const logger = createLogger({}, true);
const env = { ML_CLIENT_ID: "123", ML_CLIENT_SECRET: "secret", ML_REDIRECT_URI: "https://example.com/cb" };

describe("token OAuth do Mercado Livre", () => {
  it("renova com refresh_token e persiste o novo (uso único)", async () => {
    const repo = new MemoryRepository();
    const m = mockFetch([[/oauth\/token/, () => json({ access_token: "APP_USR-new-token", refresh_token: "TG-new", expires_in: 21600 })]]);
    const p = createMlTokenProvider({ env: { ...env, ML_REFRESH_TOKEN: "TG-old" }, store: repo, fetch: m.fetch, logger });
    expect(await p.getAccessToken()).toBe("APP_USR-new-token");
    expect(repo.tokens.get("mercadolivre")?.refresh_token).toBe("TG-new");
    expect(String(m.calls[0]!.init!.body)).toContain("refresh_token=TG-old");
    // Segunda chamada usa o cache, sem nova requisição
    await p.getAccessToken();
    expect(m.calls).toHaveLength(1);
  });

  it("prefere o refresh_token salvo no banco ao da variável de ambiente", async () => {
    const repo = new MemoryRepository();
    repo.tokens.set("mercadolivre", { access_token: null, refresh_token: "TG-db", expires_at: null });
    const m = mockFetch([[/oauth\/token/, () => json({ access_token: "APP_USR-x-token", refresh_token: "TG-db2", expires_in: 100 })]]);
    const p = createMlTokenProvider({ env: { ...env, ML_REFRESH_TOKEN: "TG-env" }, store: repo, fetch: m.fetch, logger });
    await p.getAccessToken();
    expect(String(m.calls[0]!.init!.body)).toContain("refresh_token=TG-db");
  });

  it("sem credenciais retorna null sem chamar a API", async () => {
    const m = mockFetch([]);
    const p = createMlTokenProvider({ env: {}, store: null, fetch: m.fetch, logger });
    expect(await p.getAccessToken()).toBeNull();
    expect(m.calls).toHaveLength(0);
  });

  it("falha na renovação retorna null", async () => {
    const m = mockFetch([[/oauth\/token/, () => json({ message: "invalid_grant" }, 400)]]);
    const p = createMlTokenProvider({ env: { ...env, ML_REFRESH_TOKEN: "TG-bad" }, store: new MemoryRepository(), fetch: m.fetch, logger });
    expect(await p.getAccessToken()).toBeNull();
  });

  it("troca o código de autorização e monta o link", async () => {
    const repo = new MemoryRepository();
    const m = mockFetch([[/oauth\/token/, () => json({ access_token: "APP_USR-first-token", refresh_token: "TG-first", expires_in: 21600 })]]);
    await exchangeAuthorizationCode({ fetch: m.fetch, env, code: "TG-code", store: repo });
    expect(repo.tokens.get("mercadolivre")?.refresh_token).toBe("TG-first");
    expect(buildAuthorizationUrl("123", "https://example.com/cb")).toBe(
      "https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=123&redirect_uri=https%3A%2F%2Fexample.com%2Fcb",
    );
  });
});
