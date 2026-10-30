# 6. Glossário para quem está aprendendo

Cada termo vem com um exemplo de onde ele aparece no Aureon. Onde ajuda, comparo com PHP e SQL.

**Frontend e backend.** Frontend é o que roda no navegador (HTML, CSS, JavaScript da tela). Backend é o que roda no servidor (acesso ao banco, regras, senhas). No Aureon, os dois moram no mesmo projeto Next.js: `src/components/` é quase todo frontend, `src/lib/` é backend, e as páginas em `src/app/` são geradas no servidor e mandadas prontas.

**Componente.** Uma função que devolve um pedaço de tela (JSX). `Badge` em `ui.tsx` é um componente; `<Badge tone="good">no alvo</Badge>` é usá-lo. Parece um `include` do PHP com parâmetros, mas é composto como peças de Lego.

**JSX.** A sintaxe “HTML dentro do JavaScript” dos arquivos `.tsx`. Diferenças que pegam: `className` em vez de `class`; `{expressão}` para inserir valores; `{cond ? <A/> : null}` em vez de `if`; `{lista.map(item => <li key={...}>)}` em vez de `foreach`.

**Props.** Os parâmetros de um componente. Em `StatCard({ label, value, hint, icon, tone })`, tudo isso são props. São só leitura: o componente não altera as props que recebe.

**State (estado).** Dados que mudam com a interação e fazem a tela se redesenhar. No `AppShell`, `const [collapsed, setCollapsed] = useState(...)`: chamar `setCollapsed(true)` recolhe o menu. No PHP não há equivalente direto, porque cada clique recarrega a página inteira.

**Hook.** Funções do React que começam com `use`: `useState`, `useEffect`, `useActionState`, `useFormStatus` e o nosso `useMediaQuery`. Só podem ser chamadas no topo de um componente de cliente, nunca dentro de `if` ou laços.

**Server Component.** O padrão no App Router: o componente roda **só no servidor**, pode ser `async`, ler o banco e cookies, e manda HTML pronto. Não tem estado nem eventos. Todas as páginas do Aureon são assim, por isso podem chamar `loadProductViews()` direto. É o mais parecido com um template PHP.

**Client Component.** Arquivo com `"use client"` no topo. Também é renderizado no servidor na primeira vez, mas o código vai para o navegador para tratar cliques, estado e efeitos. Exemplos: `forms.tsx`, `app-shell.tsx`, `price-chart.tsx`. Regra prática: só use quando precisar de `useState`, `onClick` ou APIs do navegador.

**Server Action.** Função com `"use server"` (em `app/actions.ts`) que o formulário chama como se fosse local, mas que roda no servidor. Substitui o “`<form action="salvar.php">`”. Sempre comece por `requireAdmin()`.

**API e endpoint.** Uma API é um conjunto de endereços que um programa chama para obter ou enviar dados. Cada endereço é um endpoint. O Aureon **consome** APIs: `GET https://api.mercadolibre.com/items/MLB123` (preço), `POST https://api.telegram.org/bot.../sendMessage`, `POST https://api.resend.com/emails`. O Aureon não expõe uma API própria; as Server Actions fazem esse papel internamente.

**Middleware.** Código que roda antes de cada requisição chegar à página. O `src/middleware.ts` confere o cookie e manda quem não está logado para `/login`. É como um `require 'verifica_login.php'` no topo de cada página, só que automático.

**Banco de dados relacional.** Dados em tabelas ligadas por chaves. No Aureon: `products` 1→N `product_sources` 1→N `price_history`. Você já conhece isso do MySQL/PostgreSQL. Aqui as restrições (`check`, `unique`, `foreign key`) fazem parte da segurança: o banco recusa um sucesso sem preço mesmo que o código erre.

**Supabase.** Um PostgreSQL hospedado com extras (painel web, autenticação, APIs). O Aureon usa o Postgres e a biblioteca `@supabase/supabase-js`, que monta as consultas: `db.from("products").select("*").eq("id", id)` equivale a `SELECT * FROM products WHERE id = $1`. Não usa o login do Supabase: o login é próprio.

**RLS (Row Level Security).** Regras no Postgres que dizem quem pode ver cada linha. O Aureon liga o RLS em todas as tabelas e não cria regra nenhuma para o público, ou seja, ninguém lê com a chave pública. O servidor usa a chave `service_role`, que ignora o RLS.

**Variáveis de ambiente.** Configurações que ficam fora do código: senhas, chaves, URLs. No Aureon, ficam no `.env.local` (local), na Vercel (painel) e nos Secrets do GitHub (coleta), e são lidas por `src/lib/env.ts`. Em PHP, seria o `getenv()` ou o `.env` do Laravel.

**Autenticação e autorização.** Autenticação responde “quem é você?” (a senha em `/login`). Autorização responde “você pode fazer isso?” (`requireAdmin()` em cada ação). O Aureon tem um único papel, o de administrador, então as duas quase se confundem; num sistema com vários usuários, seriam bem diferentes.

**Cookie de sessão.** Pequeno texto que o navegador guarda e reenvia a cada requisição. O `mp_session` prova que você fez login. É `httpOnly` (o JavaScript da página não consegue ler) e assinado (não dá para falsificar).

**HMAC.** Uma “assinatura” feita com um segredo. Quem tem o segredo gera e confere; quem não tem não consegue forjar. É o que protege o cookie de sessão.

**Migração de banco.** Um arquivo SQL versionado que muda a estrutura do banco. `supabase/migrations/20261027000000_init.sql` cria tudo. Para mudar, crie outro com data maior; nunca edite um já aplicado. Igual às *migrations* do Laravel.

**Validação.** Conferir dados antes de usar. O Aureon valida no navegador (`required`, `maxLength`), no servidor com Zod (`validation.ts`) e no banco (`check`). A do navegador é só conforto: quem garante é a do servidor.

**Zod.** Biblioteca que descreve o formato dos dados e valida em tempo de execução. O TypeScript confere tipos só enquanto você programa; o Zod confere os dados reais (formulário, resposta da API) quando o programa roda.

**TypeScript.** JavaScript com tipos. `function formatBRL(value: number | null): string` diz que entra número ou nulo e sai texto. O `npm run typecheck` acusa erros antes de rodar. O projeto usa o modo `strict`, então `any` e nulos esquecidos viram erro.

**Build e deploy.** Build é transformar o código-fonte em arquivos otimizados para produção (`npm run build` gera a pasta `.next/`). Deploy é publicar esse resultado num servidor (a Vercel faz build e deploy a cada push).

**Serverless.** Modelo em que não há um servidor seu ligado o tempo todo: cada requisição acorda uma função que roda e termina. É o caso da Vercel, e por isso a coleta longa fica no GitHub Actions.

**Cron Job.** Tarefa agendada por horário. A expressão `0 11 * * *` no workflow significa “minuto 0, hora 11 (UTC), todo dia”. Os cinco campos são minuto, hora, dia do mês, mês e dia da semana.

**Webhook.** Um endereço do seu sistema que **outro** sistema chama quando algo acontece. O Aureon **não** usa webhooks: ele busca os preços (*polling*) uma vez por dia. A página `/ml-callback` parece um, mas é só o retorno do navegador após a autorização do Mercado Livre (fluxo OAuth).

**OAuth.** Protocolo para um app acessar uma conta sua em outro serviço sem saber sua senha. Você autoriza no site do Mercado Livre, recebe um código, troca por um *access token* (curto) e um *refresh token* (para renovar). Tudo isso está em `mercadolivre-auth.ts`.

**SSRF.** Ataque em que o servidor é induzido a acessar um endereço interno usando uma URL fornecida pelo usuário. Evitado pela lista de domínios em `url-allowlist.ts` e porque o Aureon nunca acessa a URL informada.

**Idempotência.** Fazer de novo não muda o resultado. A coleta agendada é idempotente no dia: a chave `schedule:AAAA-MM-DD` impede uma segunda execução. O mesmo vale para os envios (`daily:AAAA-MM-DD`).

**Teste unitário.** Testa uma peça isolada, sem banco nem rede. `nextTheme("dark")` deve ser `"system"` (`tests/ui-prefs.test.ts`).

**Teste de integração.** Testa peças funcionando juntas com algo real. `tests/integration/supabase-flow.int.test.ts` roda a coleta contra um Postgres de verdade (local).

**Mock / stub.** Substituto falso de algo real usado em teste. `tests/helpers/memory-repository.ts` finge ser o banco; os testes do coletor passam um `fetch` falso que devolve respostas prontas.

**Git e GitHub.** Git é o controle de versões (cada `commit` é uma foto do projeto; `branch` é uma linha paralela de trabalho). GitHub é onde o repositório fica hospedado, e também roda o CI e a coleta diária (GitHub Actions).

**CI (Integração Contínua).** Verificação automática a cada push. O `ci.yml` roda tipos, lint, testes, build e auditoria de dependências. Se algo quebrar, você sabe antes de publicar.

**Lint.** Análise automática que aponta código suspeito ou fora do padrão (`npm run lint`, com ESLint).

**Tailwind CSS.** Estilo por classes utilitárias direto no JSX: `rounded-xl border border-line p-4` em vez de escrever CSS num arquivo à parte. As cores do Aureon (`bg-accent`, `text-muted`) vêm dos tokens em `globals.css`.

**Responsividade e breakpoints.** A tela se adapta à largura. No Tailwind, prefixos indicam “a partir de”: `sm:` 640 px, `md:` 768 px, `lg:` 1024 px, `xl:` 1280 px. `hidden md:block` = escondido no celular, visível a partir de 768 px.

**Acessibilidade (a11y).** Fazer o sistema funcionar para todos, inclusive com teclado e leitor de tela. No Aureon: textos `sr-only` (só para leitores de tela), `aria-current` no menu, `aria-pressed` nos botões de período, contraste das cores, foco visível e o respeito a `prefers-reduced-motion`.
