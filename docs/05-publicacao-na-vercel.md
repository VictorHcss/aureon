# 5. Publicação na Vercel

O painel vai para a Vercel; a coleta diária continua no GitHub Actions. Este guia cobre os dois, porque um depende do outro.

> **Sobre planos e limites:** os limites da Vercel, do GitHub e do Supabase mudam com o tempo. Onde este guia cita um limite, ele é uma referência; confira a página oficial antes de depender dele.

## Antes de começar: o que o projeto já tem pronto

Verifiquei o projeto pensando em ambiente *serverless* (sem servidor ligado o tempo todo):

| Ponto | Situação |
|---|---|
| Build | `next build` padrão; a Vercel detecta o Next sozinha. Não precisa de `vercel.json`. |
| Versão do Node | `package.json` → `"engines": { "node": ">=22.9.0 <23" }`. A Vercel usa esse campo para escolher a versão. Confira no log do primeiro build a linha que informa a versão do Node usada. |
| Processos permanentes | **Nenhum** no painel. A coleta é um script que roda e termina, no GitHub Actions. |
| Arquivos locais | Nada é gravado em disco. Tudo vai para o Supabase. |
| Estado em memória | Só o limite de tentativas (`rate-limit.ts`) e o cache do cliente Supabase. Na Vercel, cada instância tem o seu; isso deixa o limite de login menos rígido, mas não quebra nada. |
| Tempo de execução | Páginas com chamadas externas (`/produtos/[id]` e `/configuracoes`) declaram `maxDuration = 60`, um valor aceito em todos os planos. |
| Middleware | Roda no Edge; usa só Web Crypto e `process.env.SESSION_SECRET`. |
| Cookies | `secure` em produção, `httpOnly`, `SameSite=Lax`. |
| Segredos | Nenhuma variável `NEXT_PUBLIC_*`; nada chega ao navegador. |

## Passo 1: código no GitHub

```bash
git init
git add .
git commit -m "Aureon"
git branch -M main
git remote add origin https://github.com/VictorHcss/aureon.git
git push -u origin main
```

Antes do primeiro `git add`, confira que o `.env.local` **não** vai junto:

```bash
git status --ignored | grep env     # .env.local deve aparecer como ignorado
```

Prefira um repositório **privado**: a lista de produtos não fica no código, mas o repositório revela a estrutura do seu sistema.

## Passo 2: importar na Vercel

1. Em <https://vercel.com/new>, escolha o repositório.
2. **Framework Preset:** Next.js (detectado). Build e Output: deixe o padrão.
3. **Não** clique em Deploy ainda: configure as variáveis primeiro (passo 3). Se clicar antes, não tem problema; o painel só mostrará “Falta conectar o banco de dados” até você configurar e fazer *Redeploy*.

## Passo 3: variáveis de ambiente

Em **Settings → Environment Variables**. Marque **Production** (e **Preview**, se for usar URLs de preview com login).

| Variável | Precisa? | Observação |
|---|---|---|
| `SUPABASE_URL` | sim | |
| `SUPABASE_SERVICE_ROLE_KEY` | sim | Marque como **Sensitive**. |
| `ADMIN_PASSWORD` | sim | Sensitive. |
| `SESSION_SECRET` | sim | Sensitive. 32+ caracteres. Use um valor **diferente** do seu `.env.local`. |
| `APP_BASE_URL` | recomendada | A URL final, por exemplo `https://aureon-seunome.vercel.app`. |
| `ML_CLIENT_ID`, `ML_CLIENT_SECRET`, `ML_REDIRECT_URI` | sim, para o “Consultar agora” | Secret como Sensitive. |
| `ML_ZIP_CODE` | não | Frete. |
| `RESEND_API_KEY`, `EMAIL_FROM`, `REPORT_EMAIL_TO` | para testar e-mail pelo painel | |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | para testar Telegram pelo painel | |
| `WHATSAPP_*` | opcional | |
| `COLLECTOR_TIMEOUT_MS`, `COLLECTOR_MIN_INTERVAL_MS` | não | Ajustes finos. |

**Não** precisa cadastrar na Vercel: `ML_REFRESH_TOKEN` e `ML_ACCESS_TOKEN` (o token fica no banco) nem `FAIL_ON_PARTIAL` (só o workflow usa).

> Mudou uma variável? Ela só vale no **próximo deploy**. Vá em **Deployments → ⋯ → Redeploy**.

## Passo 4: domínio e URL de callback

1. Depois do primeiro deploy, anote a URL de produção (ou configure um domínio próprio em **Settings → Domains**).
2. Atualize `APP_BASE_URL` com essa URL.
3. No portal do Mercado Livre, a **URI de redirecionamento** deve ser `https://SUA-URL/ml-callback`, idêntica a `ML_REDIRECT_URI` (na Vercel e no `.env.local`).
4. Faça o `npm run ml:auth` no seu computador (veja o [guia de instalação](01-instalacao-e-configuracao.md#etapa-2-mercado-livre)). A página `/ml-callback` do painel publicado mostra o comando com o código. Essa página não troca o código por token: isso exige o `client_secret`, que fica só na sua máquina.

## Passo 5: banco

O Supabase é o mesmo do desenvolvimento ou um projeto separado de produção. Se for separado, aplique a migração nele também e use as chaves dele na Vercel e no GitHub.

> No plano gratuito, o Supabase pausa projetos parados por cerca de uma semana. A coleta diária mantém o projeto ativo.

## Passo 6: rotinas agendadas e notificações

### Configurar o GitHub Actions

No repositório: **Settings → Secrets and variables → Actions**.

**Secrets** (sigilosos): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ML_CLIENT_ID`, `ML_CLIENT_SECRET`, `ML_REDIRECT_URI`, e conforme os canais: `RESEND_API_KEY`, `TELEGRAM_BOT_TOKEN`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`. Opcional: `ML_REFRESH_TOKEN`.

**Variables** (não sigilosos): `APP_BASE_URL`, `EMAIL_FROM`, `REPORT_EMAIL_TO`, `TELEGRAM_CHAT_ID`, `ML_ZIP_CODE`, `WHATSAPP_TO`, `WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_TEMPLATE_LANG`, `WHATSAPP_API_VERSION`, `FAIL_ON_PARTIAL`.

Depois: aba **Actions** → habilite os workflows se pedir → **Coleta diária → Run workflow** com o modo `teste-de-notificacao`, e depois `completo`.

### Rotinas agendadas

Avaliei trocar o GitHub Actions por **Vercel Cron Jobs** e mantive o GitHub Actions. Os motivos:

| | GitHub Actions (atual) | Vercel Cron |
|---|---|---|
| Como roda | Um script Node que termina quando acaba | Chama uma rota HTTP do seu app, que vira uma função com limite de tempo |
| Tempo disponível | Até o `timeout-minutes: 20` do workflow | O `maxDuration` da função, limitado pelo plano |
| Precisão do horário | Pode atrasar alguns minutos | No plano Hobby, a execução pode cair em qualquer momento dentro da hora; confira a documentação de Cron da Vercel |
| Segurança | Nenhum endpoint público | Exige criar uma rota protegida por `CRON_SECRET` |
| Mudança no código | Nenhuma | Nova rota + `vercel.json` + revisar limites |

Com poucos produtos, as duas opções dariam conta. Migrar acrescentaria uma superfície pública e um limite de tempo sem resolver nenhum problema atual. Se um dia o atraso do GitHub incomodar, a alternativa registrada no README é o Supabase Cron com `pg_net` chamando uma rota protegida.

## Diferenças entre local e produção

| | Local (`npm run dev`) | Produção (Vercel) |
|---|---|---|
| Variáveis | `.env.local` | Painel da Vercel (e Secrets do GitHub para a coleta) |
| Cookie de sessão | sem `secure` (http) | `secure` (só https) |
| HSTS | ignorado pelo navegador em localhost | força https por 2 anos |
| Erros | mensagem completa na tela | `error.tsx` mostra só um código (`digest`); a mensagem fica no log |
| Limite de login | um contador só | um por instância |
| Recarregamento | automático ao salvar | só com novo deploy |

## Logs e diagnóstico

- **Erro numa página:** anote o código que aparece na tela de erro e procure em **Vercel → projeto → Logs** (logs de runtime). As mensagens já saem sem tokens graças ao `logger.ts`.
- **Erro no build:** **Deployments → o deploy com falha → Build Logs**. Rode `npm run check` localmente: o que quebra lá quebra aqui.
- **Coleta não rodou ou falhou:** GitHub → **Actions → Coleta diária → a execução**. O log é JSON com `executionId`. No painel, veja **Coletas e envios**.
- **Envio falhou:** **Coletas e envios → Notificações**, coluna Detalhe.

## Atualizar depois de publicar

Cada `git push` na `main` gera um deploy de produção automaticamente. Em outras branches, a Vercel cria um **Preview** com URL própria, bom para testar antes de juntar na `main`.

Fluxo seguro:

```bash
git checkout -b ajuste-cards
# ...muda o código...
npm run check
git commit -am "Ajusta cards da visão geral"
git push -u origin ajuste-cards      # Vercel gera um Preview
# testou no Preview? abra um Pull Request e junte na main
```

Se a mudança envolver o banco, crie uma **migração nova** e aplique no Supabase **antes** de publicar o código que depende dela.

## Voltar a uma versão anterior

Na Vercel, **Deployments**: escolha um deploy anterior que funcionava → **⋯ → Instant Rollback** (ou “Promote to Production”, dependendo da interface). A troca é imediata e não exige novo build.

Atenção: o rollback volta **o código**, não o banco. Se a versão nova aplicou uma migração, a versão antiga precisa continuar compatível com ela. É mais um motivo para fazer migrações que só **acrescentam** (novas colunas opcionais) em vez de renomear ou apagar.

No Git, para desfazer de vez: `git revert <commit>` e `git push`.

## Checklist final de publicação

- [ ] `npm run check` passa localmente.
- [ ] `.env.local` não está no repositório.
- [ ] Variáveis cadastradas na Vercel (Production) e deploy refeito depois delas.
- [ ] Login funciona na URL publicada.
- [ ] `APP_BASE_URL` e `ML_REDIRECT_URI` apontam para a URL publicada.
- [ ] `npm run ml:auth` feito e “Consultar agora” retorna preço.
- [ ] Secrets e Variables do GitHub cadastrados.
- [ ] Workflow “Coleta diária” rodado à mão com sucesso.
- [ ] Mensagem de teste chegou em cada canal ativo.
