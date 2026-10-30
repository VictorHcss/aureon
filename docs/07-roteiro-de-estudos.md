# 7. Roteiro de estudos

Um caminho em seis etapas, da tela até a automação. Em cada uma: o que abrir, perguntas para responder sozinho e um exercício pequeno e seguro. Faça os exercícios numa branch (`git checkout -b estudo-etapa-1`), assim você pode descartar tudo com `git checkout main`.

**Antes de começar:** deixe `npm run dev` rodando num terminal e `npm run test:watch` em outro. O primeiro recarrega a tela a cada mudança; o segundo roda os testes a cada mudança.

> Dica: não precisa de banco para as etapas 1 e 2. Sem Supabase, as páginas mostram o aviso de configuração, mas o login, o menu, o tema e a estrutura funcionam.

---

## Etapa 1: a interface (2 a 3 horas)

**Abra:** `src/app/globals.css`, `src/components/ui.tsx`, `src/lib/brand.ts`, `src/app/login/page.tsx`.

**Perguntas:**
1. Onde está definida a cor do botão principal? Por que existe `--accent` **e** `--link`?
2. Como a classe `bg-surface` sabe a cor certa no tema escuro?
3. O que o componente `Money` faz com `null`? (Dica: siga até `formatBRL` em `lib/money.ts`.)
4. Por que `ui.tsx` não tem `"use client"` no topo?

**Exercício 1: mudar um texto.** Em `login/page.tsx`, troque a frase “O preço certo aparece. O Aureon avisa você.” por outra. Salve e veja em `/login`.
*Como testar:* recarregue a página. Rode `npm test`: o `branding.test.ts` continua passando?

**Exercício 2: mudar uma cor.** Em `globals.css`, troque `--accent` por outro tom (só no `:root`, tema claro). O que mudou na tela? Por que o tema escuro não mudou? Depois desfaça.

---

## Etapa 2: componentes, props e estado (3 a 4 horas)

**Abra:** `src/components/layout/app-shell.tsx`, `nav-list.tsx`, `theme-toggle.tsx`, `src/lib/ui-prefs.ts`, `tests/ui-prefs.test.ts`.

**Perguntas:**
1. Quais props o `AppShell` recebe e de onde elas vêm? (Abra `(painel)/layout.tsx`.)
2. O que acontece, passo a passo, quando você clica no botão de tema?
3. Por que `NAV_ITEMS` é usado tanto no menu lateral quanto na gaveta? O que aconteceria se fossem duas listas?
4. `isActivePath("/produtos", "/produtos-antigos")` devolve o quê? Por que esse caso está no teste?

**Exercício 3: criar um componente.** Em `ui.tsx`, crie:

```tsx
export function Hint({ children }: { children: ReactNode }) {
  return <p className="rounded-lg bg-accent-soft px-3 py-2 text-xs text-link">{children}</p>;
}
```

Use-o na página `produtos/novo/page.tsx`, abaixo do `PageHeader`, com uma dica sua.
*Como testar:* veja a página nos temas claro e escuro. Rode `npm run typecheck` e `npm run lint`.

**Exercício 4: um item de menu desativado (só para ler).** Responda sem programar: se você adicionasse `{ href: "/relatorios", ... }` em `NAV_ITEMS` sem criar a página, o que aconteceria ao clicar? (É por isso que o Aureon não cria itens de menu sem página.)

---

## Etapa 3: páginas e dados (3 a 4 horas)

Para esta etapa, o ideal é ter o Supabase configurado e alguns produtos cadastrados.

**Abra:** `src/app/(painel)/page.tsx`, `src/lib/dashboard.ts`, `src/lib/db/queries.ts`, `src/lib/analytics.ts`, `tests/dashboard.test.ts`.

**Perguntas:**
1. Quantas consultas ao banco a Visão geral faz? Elas rodam em sequência ou em paralelo?
2. Qual a diferença entre `monitored` e `views`? E entre `drops` e `opportunities`?
3. O que é um `ProductView` e quem o monta?
4. Por que o cálculo dos cards fica em `lib/dashboard.ts` e não dentro da página?
5. Como a página de Produtos sabe qual filtro aplicar? (Dica: `searchParams`.)

**Exercício 5: modificar um card.** No card “Monitorados” da Visão geral, troque o `hint` para mostrar também quantos produtos estão pausados. Calcule isso em `summarizeDashboard` (ex.: `paused: views.filter(v => !v.product.active).length`) e use na página.
*Como testar:* adicione no `tests/dashboard.test.ts` um `expect(s.paused).toBe(1)` (a lista de teste tem um produto pausado). Rode `npm test`. Pause um produto no painel e veja o número mudar.

---

## Etapa 4: formulários, validação e ações (3 a 4 horas)

**Abra:** `src/components/forms.tsx`, `src/app/actions.ts`, `src/lib/validation.ts`, `src/lib/url-allowlist.ts`, `tests/validation.test.ts`, `tests/url-allowlist.test.ts`.

**Perguntas:**
1. O que acontece se você remover o `required` do campo nome? O cadastro passa a aceitar nome vazio? Por quê?
2. Siga o caminho de um link do Mercado Livre desde o `SourceForm` até o `insert`. Quais funções ele atravessa?
3. Por que toda função em `actions.ts` começa com `await requireAdmin()`, se o middleware já protege?
4. Como o botão “Salvar” evita o envio duplicado?

**Exercício 6: adicionar uma validação.** Faça o campo “Observações” recusar textos com mais de 500 caracteres:
- em `validation.ts`, `notes: text(500)`;
- em `forms.tsx`, `maxLength={500}` no `textarea`.

*Como testar:* em `tests/validation.test.ts`, crie um caso que envia `notes: "a".repeat(501)` e espera `success === false`. Rode `npm test`. Depois experimente no painel.

> Repare: você mudou a validação, mas não o banco. A coluna `notes` continua aceitando textos maiores. Faz sentido? Quando valeria criar uma migração com um `check` novo?

---

## Etapa 5: integrações e regras de negócio (4 a 6 horas)

**Abra:** `src/lib/collectors/types.ts`, `mercadolivre.ts`, `http.ts`, `src/lib/jobs/collect.ts`, `src/lib/alerts/engine.ts`, `tests/mercadolivre.test.ts`, `tests/collect-job.test.ts`, `tests/alerts.test.ts`.

**Perguntas:**
1. Quais são os 7 status possíveis de uma coleta? Qual deles grava preço?
2. Por que os coletores devolvem um resultado em vez de lançar erro?
3. O que acontece quando a API responde 401? E 503? E quando demora mais de 15 s?
4. Na regra “Preço igual ou abaixo do alvo”, por que a `eventKey` inclui o preço em centavos?
5. Como o teste do coletor consegue simular a API sem internet?

**Exercício 7: defesa em camadas.** Em `collect.ts`, troque `price: ok ? result.price : null` por `price: result.price` e rode `npm test`. Nenhum teste falha! Investigue por quê: o que `emptyResult` (em `collectors/types.ts`) devolve como preço quando a coleta falha? E o que a restrição `price_history_success_has_price` do SQL faz? Conclusão: esse `ok ? … : null` é uma **terceira** barreira, que só importaria se um coletor novo fosse escrito com erro. Desfaça a mudança.

*Desafio extra:* escreva um teste que pegue essa mudança. Você vai precisar substituir o coletor registrado por um falso que devolve `status: "temporary_failure"` com `price: 100` (pesquise `vi.mock` no Vitest).

**Exercício 8 (desafio): nova regra de alerta, só no motor.** Escreva no papel como seria uma regra “preço abaixo do preço máximo” (`max_price` do produto). Quais arquivos você teria que mudar? (Resposta esperada: `types.ts`, `engine.ts`, `validation.ts`, uma migração para a restrição `alert_rules_type_valid`, e testes.) Implementar é opcional.

---

## Etapa 6: banco, automação e publicação (3 a 4 horas)

**Abra:** `supabase/migrations/20261027000000_init.sql`, `src/lib/db/repository.ts`, `supabase-repository.ts`, `tests/helpers/memory-repository.ts`, `scripts/daily.ts`, `.github/workflows/coleta-diaria.yml`, `.github/workflows/ci.yml`, `next.config.ts`.

**Perguntas:**
1. Quais restrições do SQL impedem que uma falha vire preço? E que o relatório saia duas vezes no dia?
2. Por que existe a interface `Repository` com duas implementações?
3. O que o workflow faz se a coleta falhar por completo? E se falhar só em parte?
4. Que horas em Brasília significa `cron: "0 11 * * *"`? E se você quisesse rodar às 20h?
5. O que cada cabeçalho do `next.config.ts` protege?

**Exercício 9: simular uma execução.** Com o banco configurado, rode:

```bash
npx tsx --env-file=.env.local scripts/daily.ts --dry-run
```

Leia o log JSON: encontre o `executionId`, os status de cada oferta e a mensagem de simulação dos envios. Depois abra **Coletas e envios** no painel.

**Exercício 10: publicar um Preview.** Faça uma mudança visual pequena numa branch, dê `git push` e abra a URL de Preview que a Vercel gera. Compare com a produção. Depois, pratique o *Instant Rollback* num deploy antigo (e volte).

---

## Para depois do roteiro

- Leia a documentação oficial do **App Router** (Next.js), especialmente “Server and Client Components” e “Server Actions”.
- No React, leia “You Might Not Need an Effect”: ajuda a entender por que o Aureon usa poucos `useEffect`.
- No Vitest, aprenda `vi.fn()` e `vi.mock()`. O Aureon prefere passar dependências falsas à mão (um `fetch` simulado, o repositório em memória); comparar os dois estilos ajuda a entender injeção de dependência.
- Ideia de projeto: implemente a exportação do histórico em CSV numa página nova, com teste. Ela toca em quase todas as camadas que você estudou.
