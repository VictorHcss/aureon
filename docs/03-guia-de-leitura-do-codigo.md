# 3. Guia de leitura do código

Este guia percorre os arquivos mais importantes **na ordem em que os dados passam por eles**. Para cada um: o que faz, por que fica ali, o que entra e o que sai, com quem conversa, e o que dá para mexer sem medo.

Os trechos de código são cópias reais (às vezes encurtadas com `// ...`). Abra o arquivo ao lado enquanto lê.

---

## Parte A: a casca (layout, login, tema)

### `src/app/layout.tsx` (layout raiz)

**Responsabilidade:** o `<html>` e o `<body>` de **todas** as páginas, mais os metadados (título da aba) e as fontes.

```tsx
export const metadata: Metadata = {
  title: { default: BRAND.name, template: `%s · ${BRAND.name}` },
  // ...
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="pt-BR" data-theme={theme === "system" ? undefined : theme}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
```

Lendo devagar:

- `template: "%s · Aureon"`: se uma página declara `title: "Produtos"`, a aba mostra “Produtos · Aureon”. O `%s` é substituído pelo título da página.
- `async function`: no App Router, um componente de servidor pode ser `async` e usar `await`. Em PHP seria como ler `$_COOKIE` no topo do template.
- `cookies()` é do Next e só funciona no servidor. Em Next 15 ela devolve uma *Promise*, por isso o `await`.
- `data-theme={... ? undefined : theme}`: em JSX, um atributo `undefined` simplesmente **não é escrito**. Com tema “system”, o `<html>` sai sem `data-theme`, e o CSS segue a preferência do sistema.
- `{children}` é a página que está sendo exibida, encaixada aqui dentro.

**Pode mexer com segurança:** metadados, fontes. **Cuidado:** este arquivo envolve tudo; um erro aqui derruba todas as páginas.

### `src/app/globals.css` (tema e tokens)

**Responsabilidade:** as cores, a fonte e os estilos base de formulário. O topo define **variáveis CSS** para o tema claro, e dois blocos redefinem as mesmas variáveis para o escuro:

```css
:root { --paper: #f6f7f9; --ink: #202329; --accent: #f59e0b; /* ... */ }

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { --paper: #15171b; /* ... */ }
}
:root[data-theme="dark"] { --paper: #15171b; /* ... */ }
```

Traduzindo: “se o sistema está no escuro **e** o usuário não forçou claro, use as cores escuras” e “se o usuário forçou escuro, use as cores escuras”. Os dois blocos são iguais de propósito: o CSS não permite juntar uma `@media` com um seletor comum numa regra só.

Depois vem o `@theme inline`, que é do **Tailwind 4**:

```css
@theme inline {
  --color-paper: var(--paper);
  --color-accent: var(--accent);
  /* ... */
}
```

Cada `--color-xxx` vira uma classe utilitária: `bg-paper`, `text-accent`, `border-line`... Como as classes apontam para variáveis, trocar o tema muda a variável e **todas** as classes acompanham, sem um `dark:` espalhado pelo código.

Dois tokens merecem atenção:

- `--accent` (#F59E0B) é para **fundos** (botão principal, filete do menu). Sobre branco, como cor de texto, ele não tem contraste suficiente.
- `--link` é o dourado escuro para **texto** (links, botões “quiet”). Use `text-link`, não `text-accent`, quando for texto.

**Pode mexer:** os valores das cores (confira o contraste em <https://webaim.org/resources/contrastchecker/>). **Cuidado:** renomear um token quebra todas as classes que o usam.

### `src/lib/ui-prefs.ts` e `src/components/layout/theme-toggle.tsx`

`ui-prefs.ts` é TypeScript puro (sem React), por isso dá para testar:

```ts
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export function parseTheme(value: string | undefined | null): Theme {
  return (THEMES as readonly string[]).includes(value ?? "") ? (value as Theme) : "system";
}
```

A sintaxe que assusta:

- `as const` congela o array: o TypeScript passa a saber que ele contém **exatamente** essas três strings, não um `string[]` qualquer.
- `(typeof THEMES)[number]` quer dizer “o tipo de qualquer elemento desse array”, ou seja, `"system" | "light" | "dark"`. Assim o tipo e a lista nunca ficam dessincronizados.
- `value ?? ""`: o `??` usa o da direita quando o da esquerda é `null` ou `undefined`.

O botão (`theme-toggle.tsx`) é Client Component porque reage a clique. A função `applyTheme` muda o `data-theme` do `<html>` na hora e grava o cookie para a próxima visita.

### `src/middleware.ts` (o porteiro)

**Responsabilidade:** antes de qualquer página (exceto login, callback do ML e arquivos estáticos), conferir o cookie de sessão.

```ts
export async function middleware(req: NextRequest) {
  const ok = await verifySessionValue(req.cookies.get(SESSION_COOKIE)?.value, process.env.SESSION_SECRET);
  if (ok) return NextResponse.next();
  if (req.method !== "GET") return new NextResponse("Não autorizado", { status: 401 });
  // redireciona GET para /login
}

export const config = {
  matcher: ["/((?!login|ml-callback|_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
```

O `matcher` é uma expressão regular com *negative lookahead* `(?!...)`: “qualquer caminho que **não** comece com login, ml-callback...”.

O middleware roda no **Edge Runtime** (um ambiente mais leve que o Node), e por isso a sessão usa Web Crypto (`crypto.subtle`), que existe nos dois ambientes.

### `src/lib/auth/session.ts` e `guard.ts`

O cookie tem o formato `"<expira_em_ms>.<assinatura>"`. A assinatura é um HMAC-SHA256 de `admin:<expira_em_ms>` usando o `SESSION_SECRET`. Quem não conhece o segredo não consegue fabricar uma assinatura válida, nem esticar a validade.

```ts
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
```

Por que não `a === b`? Porque `===` para de comparar no primeiro caractere diferente, e um atacante poderia medir o tempo de resposta para adivinhar a assinatura aos poucos. Aqui o laço sempre percorre tudo (`^` é XOR, `|=` acumula qualquer diferença).

`guard.ts` tem `requireAdmin()`, chamado em **toda** Server Action e no layout do painel. Mesmo que alguém achasse um furo no middleware, as ações continuariam protegidas.

### `src/app/(painel)/layout.tsx` + `src/components/layout/app-shell.tsx`

O layout (servidor) chama `requireAdmin()`, lê os cookies de preferência e entrega tudo ao `AppShell`:

```tsx
<AppShell initialCollapsed={...} theme={...}>
  {children}
</AppShell>
```

O `AppShell` é Client Component (tem estado: menu recolhido, gaveta aberta). **Mas as páginas continuam sendo de servidor.** Isso funciona porque elas chegam como `children`, já renderizadas. A regra do Next é: um Client Component não pode *importar* um Server Component, mas pode *receber* um como `children`.

Trechos que valem a leitura no `app-shell.tsx`:

- A gaveta do celular é um `<dialog>` nativo aberto com `showModal()`. O navegador já faz o difícil: prende o foco dentro, fecha com Esc e escurece o fundo (`::backdrop`).
- `useEffect(() => { drawer.current?.close(); }, [path]);` fecha a gaveta quando a rota muda.
- `<div key={path} className="animate-enter">`: mudar a `key` faz o React recriar o elemento, e a animação de entrada roda de novo a cada página.
- O link “Pular para o conteúdo” fica invisível até receber foco pelo teclado.

---

## Parte B: as páginas

Todas seguem o mesmo roteiro, então entender uma é entender todas.

```tsx
export default async function Dashboard() {
  if (!isSupabaseConfigured()) return <SetupNotice />;      // 1. tem banco?
  let data;
  try {
    const [views, runs, lastOk, alerts] = await Promise.all([ /* consultas */ ]); // 2. busca em paralelo
    data = { views, lastRun: runs[0] ?? null, lastOk, alerts };
  } catch (e) {
    return <ErrorNotice message={errorMessage(e)} />;       // 3. erro amigável
  }
  if (!views.length) return <EmptyState ... />;             // 4. estado vazio
  const s = summarizeDashboard(views);                      // 5. cálculo fora da página
  return ( /* 6. JSX */ );
}
```

`Promise.all` dispara as quatro consultas ao mesmo tempo e espera todas. Fazer uma depois da outra somaria os tempos.

| Página | Arquivo | Destaques |
|---|---|---|
| Visão geral | `(painel)/page.tsx` | Indicadores, oportunidades, gráfico, última coleta, atenção, alertas. Os números vêm de `lib/dashboard.ts`. |
| Produtos | `(painel)/produtos/page.tsx` | Filtros via `searchParams` (a query string, como `$_GET`), cartões no celular e tabela a partir de 768 px. |
| Novo produto | `produtos/novo/page.tsx` | Só o `ProductForm`. |
| Produto | `produtos/[id]/page.tsx` | Comparação entre lojas (cartões até 1280 px, tabela acima), histórico, regras, alertas, edição. `export const maxDuration = 60` dá tempo ao “Consultar agora”. |
| Coletas e envios | `execucoes/page.tsx` | Execuções e notificações, em cartões ou tabela. |
| Configurações | `configuracoes/page.tsx` | Canais, credenciais detectadas (sem mostrar valores), testes de envio, categorias. |

**Por que cartões e tabela juntos no HTML?** Os dois são gerados no servidor, e o CSS (`md:hidden` / `hidden md:block`) mostra um ou outro conforme a largura. Sem JavaScript e sem “pulo” de layout.

---

## Parte C: formulários e ações

### `src/components/forms.tsx`

```tsx
export function ProductForm({ product, categories }: { product?: Product; categories: Category[] }) {
  const [state, action] = useActionState(saveProduct, initial);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      {product ? <input type="hidden" name="id" value={product.id} /> : null}
      <input name="name" required maxLength={160} defaultValue={product?.name} />
      {/* ... */}
      <Submit>{product ? "Salvar alterações" : "Cadastrar produto"}</Submit>
      <FormMessage state={state} />
    </form>
  );
}
```

- `useActionState(saveProduct, initial)` liga o formulário a uma Server Action e devolve o último resultado (`state`) para mostrar erro ou sucesso. Em PHP, seria o `action="salvar.php"` mais a página exibindo a mensagem que o `salvar.php` devolveu, só que sem recarregar.
- `product?.name`: o `?.` (encadeamento opcional) devolve `undefined` em vez de dar erro se `product` não existir. O mesmo formulário serve para criar e editar.
- `Submit` usa `useFormStatus()` para saber se o formulário está enviando e **desabilita o botão** enquanto isso. É o que impede o envio duplicado.

### `src/app/actions.ts` (Server Actions)

O `"use server"` no topo transforma cada função exportada num endpoint que o Next cria sozinho.

```ts
export async function saveProduct(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();                                            // 1. quem é você?
  const id = String(form.get("id") ?? "") || null;
  const parsed = ProductInput.safeParse(formToObject(form, ["active"])); // 2. valida
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  // 3. grava (insert ou update) no Supabase
  revalidatePath("/", "layout");                                   // 4. limpa o cache das páginas
  if (!id) redirect(`/produtos/${newId}?novo=1`);                  // 5. novo? vai para a página dele
  return { ok: true, message: "Alterações salvas." };
}
```

- O primeiro parâmetro (`_`) é o estado anterior, que o `useActionState` sempre passa. O `_` é a convenção para “não vou usar”.
- `revalidatePath` avisa o Next que os dados mudaram e as páginas precisam ser regeradas.
- `redirect()` funciona **lançando** um erro especial que o Next intercepta. Por isso, em `action-buttons.tsx`, o `catch` chama `unstable_rethrow(e)`: sem isso, o botão engoliria o redirect e mostraria “NEXT_REDIRECT” na tela.

**Cuidado:** toda ação nova precisa começar com `await requireAdmin()`.

### `src/lib/validation.ts`

Esquemas Zod: descrevem o formato esperado e convertem os dados. O mais interessante é o da oferta:

```ts
export const SourceInput = z
  .object({ product_url: z.string().trim().min(1).max(2000), store_name: z.string().trim().max(80).optional() })
  .transform((v, ctx) => {
    const check = checkProductUrl(v.product_url);           // domínio permitido? https?
    if (!check.ok) { ctx.addIssue({ code: "custom", message: check.reason ?? "URL inválida." }); return z.NEVER; }
    const collector = getCollector(check.sourceType!)!;
    const externalId = collector.extractId(check.url!.toString()); // acha o MLB...
    // ...
    return { product_url, source_type, external_identifier: externalId, store_name };
  });
```

Um único `safeParse` valida a URL, descobre a loja, extrai o código do anúncio e devolve o objeto pronto para gravar.

### `src/lib/url-allowlist.ts` (proteção contra SSRF)

SSRF é quando um sistema aceita uma URL do usuário e faz uma requisição para ela, podendo ser levado a acessar a rede interna. Aqui há duas barreiras:

1. Só aceita `https`, sem usuário/senha/porta, e só domínios da lista (`mercadolivre.com.br` e subdomínios).
2. **O sistema nunca acessa a URL informada.** Ela serve só para extrair o código `MLB...`; a consulta vai para `api.mercadolibre.com`.

---

## Parte D: coleta de preços

### `src/lib/collectors/types.ts`

Define o contrato de um coletor:

```ts
export interface Collector {
  type: SourceType;
  label: string;
  extractId(url: string): string | null;
  collect(input: CollectorInput, ctx: CollectorContext): Promise<CollectorResult>;
}
```

O `CollectorResult` **sempre** tem um `status` (`success`, `unavailable`, `temporary_failure`, `structure_changed`, `price_not_found`, `auth_error` ou `invalid_source`). O coletor não lança erro: ele devolve um resultado dizendo o que deu errado.

O `ctx` (contexto) traz o `fetch`, o timeout e a função que entrega o token. Isso é **injeção de dependência**: nos testes, passamos um `fetch` falso que devolve respostas prontas.

### `src/lib/collectors/http.ts`

`requestJson` envolve o `fetch` com timeout (`AbortController`), repetição com espera crescente (800 ms, 1,6 s...) para 429 e 5xx, e intervalo mínimo entre chamadas ao mesmo host (padrão 400 ms). `redirect: "error"` impede que a API redirecione a requisição para outro lugar.

### `src/lib/collectors/mercadolivre.ts`

- `extractMercadoLivreId`: aceita link de anúncio (`MLB-123...`, vira `item:MLB123...`), de catálogo (`/p/MLB123`, vira `catalog:MLB123`) e `?wid=` (anúncio específico dentro do catálogo).
- `callApi`: faz a chamada com o token e, se vier 401, invalida o token e tenta **uma** vez de novo.
- `collectItem` / `collectCatalog`: validam a resposta com Zod. Se o formato mudou, o status é `structure_changed`, sem chutar um preço.
- O frete só é consultado com `ML_ZIP_CODE` e quando não é grátis.

### `src/lib/collectors/mercadolivre-auth.ts`

O refresh token do Mercado Livre é **de uso único**: cada renovação devolve um novo. Por isso ele fica salvo na tabela `integration_tokens`, e não só numa variável de ambiente. `getAccessToken()` reaproveita o token em cache se faltarem mais de 5 minutos para expirar; senão, renova e salva.

### `src/lib/jobs/collect.ts` (a rotina de coleta)

```ts
const run = await opts.repo.startRun({ trigger, runKey, githubRunId });
if (!run) return { skipped: true, /* ... */ };   // já existe coleta com essa chave hoje

for (const source of sources) {
  const result = await collectOne(source, opts, slog);
  const ok = result.status === "success";
  await opts.repo.insertPrice({
    price: ok ? result.price : null,              // falha NUNCA vira preço
    collection_status: result.status,
    // ...
  });
  await opts.repo.updateSourceAfterCollection(source.id, { last_status: result.status, ...(ok ? { last_success_at: at } : {}) });
}
```

Três garantias importantes:

1. **Trava diária.** Na execução agendada, `runKey = "schedule:2026-10-28"`. O banco tem índice único em `run_key`, então uma segunda execução no mesmo dia não cria outra coleta.
2. **Uma loja que falha não para as outras.** Cada fonte é tratada isoladamente.
3. **Falha não apaga o último preço válido.** A falha é registrada sem preço, e os cálculos (`validPoints`) só usam linhas `success`.

`ok ? { last_success_at: at } : {}` dentro de `{ ...(...) }` é um truque comum: o `...` (spread) copia as propriedades do objeto; se for `{}`, não copia nada. Assim `last_success_at` só é atualizado quando deu certo.

**Cuidado:** este arquivo é coberto por `tests/collect-job.test.ts`. Rode `npm test` depois de qualquer mudança.

---

## Parte E: histórico, alertas, relatórios e envios

### `src/lib/analytics.ts`

Funções puras sobre listas de preços: `validPoints` (filtra só sucessos com preço > 0), `computeStats` (último, anterior, variação, mín., máx., média, se é o menor já visto), `filterByDays`, `totalPrice` (só soma o frete se for conhecido), `reachedTarget`, `isStale`.

### `src/lib/db/queries.ts` (`loadProductViews`)

É a consulta central do painel. Busca produtos com suas ofertas, depois o histórico em blocos de 50 ofertas (para não estourar o tamanho da URL), e monta para cada produto um `ProductView` com estatísticas, melhor oferta (`best`: menor total entre as ofertas ativas e atualizadas), `reachedTarget`, `stale` e `hasFailure`.

### `src/lib/alerts/engine.ts`

`evaluateAlerts` recebe regras, ofertas com histórico e eventos recentes, e devolve os alertas a disparar. Cada alerta tem uma `eventKey`, por exemplo:

```ts
case "target_price": {
  const target = rule.threshold ?? s.product.target_price;
  if (fresh && reachedTarget(latest!.price, target)) eventKey = `target:${s.source.id}:${toCents(latest!.price)}`;
  break;
}
```

A chave inclui o preço em centavos. Se amanhã o preço continuar o mesmo, a chave é a mesma e o alerta **não se repete**. Se cair mais, a chave muda e você é avisado de novo. Além disso, o `cooldown_hours` da regra impõe um intervalo mínimo entre alertas da mesma regra e oferta.

O `!` em `latest!.price` diz ao TypeScript “eu garanto que não é nulo aqui” (o `fresh` já garantiu). Use com moderação: se a garantia for falsa, o erro só aparece na execução.

### `src/lib/jobs/alerts.ts`

Busca regras, histórico e eventos, chama o motor, grava cada evento (o banco recusa duplicados) e envia pelos canais, respeitando “Alertas” e “Só oportunidades” das configurações.

### `src/lib/reports/build.ts` e `render.ts`

`build.ts` separa os itens em grupos: atingiram o alvo, maiores quedas, menor já observado, ficaram mais caros, sem atualização. `render.ts` gera quatro versões da mesma mensagem: HTML do e-mail, texto puro, HTML do Telegram e uma linha para o WhatsApp. Todo texto vindo do banco passa por `escapeHtml`, e todo link por `safeUrl` (só http/https).

### `src/lib/notify/dispatcher.ts`

```ts
if (await opts.repo.hasSentNotification(sender.channel, opts.eventKey)) {
  results.push({ channel: sender.channel, status: "duplicate" });
  continue;
}
```

Antes de enviar, verifica se aquele evento já foi enviado naquele canal. Depois registra o resultado em `notification_logs`, com um índice único no banco que impede dois envios bem-sucedidos com a mesma chave. É assim que o relatório sai no máximo uma vez por dia por canal (`daily:2026-10-28`).

`senders.ts` monta a lista de canais ativos combinando as configurações do painel com as variáveis de ambiente. Canal ligado sem credencial gera um aviso no log, não um erro.

---

## Parte F: configuração e automação

- **`src/lib/env.ts`**: o esquema Zod de todas as variáveis. `requireEnv(env, ["A", "B"])` lança um erro claro listando o que falta.
- **`next.config.ts`**: cabeçalhos de segurança (veja o [documento de arquitetura](02-arquitetura.md#decisões-de-arquitetura-registradas)).
- **`scripts/daily.ts`**: lê os argumentos, roda coleta → alertas → relatório e termina com código 1 se a coleta falhou totalmente. O GitHub marca o workflow em vermelho e manda e-mail.
- **`.github/workflows/coleta-diaria.yml`**: `cron: "0 11 * * *"`, `concurrency` (uma execução por vez), `permissions: contents: read` (o mínimo).

---

## Testes automatizados

| Arquivo | O que garante |
|---|---|
| `money.test.ts` | Conversão de “R$ 1.234,56”, “1234.56”, valores inválidos. |
| `analytics.test.ts` | Variação, mínimo, máximo, média, alvo, período, desatualização. |
| `validation.test.ts` | Formulários aceitam o certo e recusam o errado. |
| `url-allowlist.test.ts` | Bloqueio de domínios estranhos, http, porta, usuário/senha. |
| `mercadolivre.test.ts` | Coletor com 17 casos de respostas simuladas (404, 401, 5xx, timeout, formato mudado...). |
| `mercadolivre-auth.test.ts` | Renovação e cache do token. |
| `collect-job.test.ts` | Rotina inteira: falha isolada, último preço preservado, trava diária. |
| `alerts.test.ts` | Cada regra, deduplicação e espera. |
| `reports.test.ts` | Grupos do relatório, escape de HTML, links seguros. |
| `notify.test.ts` | Telegram, Resend e WhatsApp, incluindo erros do provedor. |
| `security.test.ts` | Sessão, comparação segura, redação de segredos nos logs. |
| `ui-prefs.test.ts` | Tema, menu recolhido, cookie e item ativo do menu. |
| `dashboard.test.ts` | Números da Visão geral e montagem das linhas do gráfico. |
| `branding.test.ts` | Que o nome antigo não volte para a interface. |

Um teste típico tem três partes (arrange, act, assert):

```ts
it("o botão percorre sistema → claro → escuro → sistema", () => {
  expect(nextTheme("system")).toBe("light");
  expect(nextTheme("light")).toBe("dark");
  expect(nextTheme("dark")).toBe("system");
});
```

`describe` agrupa, `it` é um caso, e `expect(x).toBe(y)` falha o teste se `x` não for `y`. Rode um arquivo só com `npx vitest run tests/ui-prefs.test.ts`, ou deixe `npm run test:watch` aberto enquanto programa.
