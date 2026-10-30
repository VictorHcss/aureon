# 1. Instalação e configuração

Este guia leva você do zero até o Aureon rodando no seu computador, já conectado ao banco, ao Mercado Livre e a pelo menos um canal de aviso. Cada etapa termina com um teste rápido. Não pule o teste: se algo der errado, é muito mais fácil descobrir na hora do que três etapas depois.

> Quer só entender o código antes de configurar tudo? Dá para rodar o painel sem banco: ele abre e mostra o aviso “Falta conectar o banco de dados”. Isso é de propósito e não é erro.

## Pré-requisitos

| O quê | Por quê |
|---|---|
| **Node.js 22.9 ou mais novo dentro da linha 22** | O `package.json` pede `>=22.9.0 <23`. A 22.9 é a primeira com `--env-file-if-exists`, que os scripts `npm run job:*` usam para ler o `.env.local`. |
| **npm** (vem junto com o Node) | Instala as dependências. |
| **Git** | Para clonar e versionar. |
| Conta no **Supabase** | Banco de dados (PostgreSQL). |
| Conta de desenvolvedor no **Mercado Livre** | É a única fonte de preços implementada. |
| **Telegram** e/ou conta no **Resend** | Para receber alertas e o relatório diário. |
| Opcional: **Meta Business** | Para o WhatsApp, que é pago e vem desligado. |

### Instalando o Node.js

O jeito mais tranquilo é usar um gerenciador de versões, porque o projeto tem um arquivo `.nvmrc` que diz qual versão usar:

```bash
# Linux/macOS com nvm (https://github.com/nvm-sh/nvm)
nvm install      # lê o .nvmrc e instala a versão 22
nvm use

# Windows: use o nvm-windows ou o instalador "LTS 22.x" de https://nodejs.org
node -v          # deve mostrar v22.algo (22.9 ou maior)
```

Se você vem do PHP: o Node faz o papel do interpretador `php`, e o `npm` faz o papel do Composer. O `package.json` equivale ao `composer.json`, o `package-lock.json` ao `composer.lock`, e a pasta `node_modules/` à `vendor/`.

## Clonar e instalar

```bash
git clone https://github.com/VictorHcss/aureon.git
cd aureon
npm ci
```

Por que `npm ci` e não `npm install`? O `ci` instala **exatamente** as versões do `package-lock.json` e falha se o lock estiver fora de sincronia. É o mesmo comando que o GitHub Actions usa, então o que funciona aí funciona lá.

## O arquivo `.env.local`

```bash
cp .env.example .env.local
```

O `.env.local` guarda as senhas e chaves. Ele está no `.gitignore` e **nunca** deve ir para o Git. O `.env.example` é o modelo, com os nomes e explicações e sem valores secretos.

Toda leitura dessas variáveis passa por `src/lib/env.ts`, que valida com Zod. Nenhuma delas começa com `NEXT_PUBLIC_`, e isso importa: no Next.js, só variáveis com esse prefixo são copiadas para o JavaScript do navegador. Sem o prefixo, elas ficam apenas no servidor.

### Cada variável explicada

**Banco (obrigatório)**

| Variável | Para que serve |
|---|---|
| `SUPABASE_URL` | Endereço do seu projeto Supabase, por exemplo `https://abcd.supabase.co`. |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave secreta com acesso total ao banco (ignora o RLS). Só o servidor usa. Se vazar, qualquer um lê e apaga tudo. |

**Painel (obrigatório)**

| Variável | Para que serve |
|---|---|
| `ADMIN_PASSWORD` | A senha única do painel. Use algo longo. |
| `SESSION_SECRET` | Segredo que assina o cookie de login. Precisa de **32 caracteres ou mais**. Gere com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Trocar esse valor desloga todo mundo. |
| `APP_BASE_URL` | Endereço público do painel. Aparece como link nos relatórios. |

**Mercado Livre (obrigatório para coletar)**

| Variável | Para que serve |
|---|---|
| `ML_CLIENT_ID`, `ML_CLIENT_SECRET` | App ID e Secret Key do seu aplicativo no portal de desenvolvedores. |
| `ML_REDIRECT_URI` | URI de retorno da autorização. Tem que ser **idêntica** à cadastrada no portal e precisa ser https, por exemplo `https://seu-painel.vercel.app/ml-callback`. |
| `ML_REFRESH_TOKEN` | Opcional. Só serve como ponto de partida; o normal é usar `npm run ml:auth`, que salva o token no banco. |
| `ML_ACCESS_TOKEN` | Opcional. Token fixo para teste rápido (expira em ~6 h). |
| `ML_ZIP_CODE` | Opcional. CEP só com números, para calcular o frete quando não é grátis. |

**E-mail (Resend)**: `RESEND_API_KEY`, `EMAIL_FROM` (remetente) e `REPORT_EMAIL_TO` (destinatário padrão; vários separados por vírgula).

**Telegram**: `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID`.

**WhatsApp (opcional)**: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TO`, `WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_TEMPLATE_LANG` e `WHATSAPP_API_VERSION`.

**Ajustes da coleta (opcionais)**: `COLLECTOR_TIMEOUT_MS` (padrão 15000), `COLLECTOR_MIN_INTERVAL_MS` (padrão 400, o intervalo entre chamadas à mesma API) e `FAIL_ON_PARTIAL` (`true` faz o workflow falhar quando parte das consultas falha).

> Os destinos salvos no painel (e-mail, chat id, número) têm prioridade sobre `REPORT_EMAIL_TO`, `TELEGRAM_CHAT_ID` e `WHATSAPP_TO`. As credenciais (tokens e chaves) só existem nas variáveis de ambiente, nunca no banco.

Para conferir o que está preenchido sem mostrar nenhum valor:

```bash
npm run env:check
```

## Etapa 1: Supabase

1. Em <https://supabase.com>, crie um projeto. A região São Paulo (`sa-east-1`) fica mais perto.
2. Abra **SQL Editor → New query**, cole o conteúdo inteiro de `supabase/migrations/20261027000000_init.sql` e clique em **Run**.
   - Alternativa pela CLI: `npx supabase link --project-ref SEU_REF` e depois `npx supabase db push`.
3. Em **Project Settings → API Keys**, copie a URL para `SUPABASE_URL` e a chave secreta (`service_role` ou a nova `sb_secret_…`) para `SUPABASE_SERVICE_ROLE_KEY`.

**Teste:** `npm run dev`, abra <http://localhost:3000>, entre com a senha. Você deve ver a Visão geral vazia com o botão “Cadastrar o primeiro produto”. Se aparecer “relation … does not exist”, a migração não foi aplicada.

### O que a migração cria

Dez tabelas, todas com RLS ligado e **sem nenhuma política** para os papéis `anon` e `authenticated`. Na prática, a chave pública do Supabase não lê nada, e só a chave secreta, usada no servidor, acessa os dados. As principais:

| Tabela | Guarda |
|---|---|
| `products` | Produtos cadastrados (nome, alvo, categoria, pausado/arquivado). |
| `product_sources` | As ofertas (links) de cada produto e a situação da última consulta. |
| `price_history` | Uma linha por consulta: preço, frete, status. Falha também vira linha, mas sem preço. |
| `collection_runs` | Cada execução de coleta, com contagem de sucessos e falhas. |
| `alert_rules` / `alert_events` | Regras de alerta e os alertas já disparados. |
| `notification_logs` / `notification_settings` | Envios feitos e configurações do painel (sempre uma linha só, `id = 1`). |
| `integration_tokens` | Token OAuth do Mercado Livre. |
| `categories` | Categorias (já vêm 11, como “Processadores”, “Monitores” e “SSDs e HDs”). |

## Etapa 2: Mercado Livre

A API exige um token OAuth. Você faz isso uma vez, e depois o sistema renova o token sozinho.

1. Em <https://developers.mercadolivre.com.br>, vá em **Minhas aplicações → Criar aplicação**.
2. Em **URI de redirecionamento**, use `https://SEU-PAINEL/ml-callback`. Se ainda não publicou o painel, faça o guia da Vercel antes ou use temporariamente qualquer página https sua e copie o `code` da barra de endereço.
3. Permissões: leitura e *offline access* (necessária para o refresh token). Deixe o PKCE **desativado**.
4. Preencha `ML_CLIENT_ID`, `ML_CLIENT_SECRET` e `ML_REDIRECT_URI`.
5. Autorize:

   ```bash
   npm run ml:auth
   # abra o link, autorize; a página /ml-callback do painel mostra o comando pronto:
   npm run ml:auth -- --code=TG-xxxxxxxx
   ```

   O código vale uma única vez e expira em poucos minutos.

**Teste:**

```bash
npm run ml:auth -- --test=https://produto.mercadolivre.com.br/MLB-XXXXXXXXXX-...
```

O JSON de saída deve ter `"status": "success"` e um preço. Se vier `auth_error`, repita o passo 5. Os detalhes dos formatos de URL aceitos estão em [`coletor-mercado-livre.md`](coletor-mercado-livre.md).

## Etapa 3: Telegram

1. No Telegram, fale com o **@BotFather**, use `/newbot` e copie o token para `TELEGRAM_BOT_TOKEN`.
2. Mande qualquer mensagem para o seu bot. Ele só consegue escrever para quem falou com ele antes.
3. Abra `https://api.telegram.org/bot<SEU_TOKEN>/getUpdates` e copie o número de `"chat":{"id": ...}`.
4. No painel, em **Configurações**: marque “Enviar pelo Telegram”, cole o chat id, salve e clique em **Testar Telegram**.

## Etapa 4: E-mail (Resend)

1. Crie uma conta em <https://resend.com> e gere uma API Key.
2. Para testar sem domínio próprio, use `EMAIL_FROM="Aureon <onboarding@resend.dev>"`. Nesse modo, o Resend só entrega para o e-mail da sua própria conta.
3. Para mandar para qualquer endereço, verifique um domínio seu em **Domains**.
4. No painel: marque “Enviar por e-mail”, informe o destinatário, salve e clique em **Testar e-mail**.

## Etapa 5 (opcional): WhatsApp

Está implementado, mas desligado por padrão. Exige conta Meta Business, um número dedicado e um modelo aprovado, e cada mensagem é cobrada. Passo a passo em [`whatsapp.md`](whatsapp.md).

## Comandos do dia a dia

| Comando | O que faz |
|---|---|
| `npm run dev` | Painel em modo desenvolvimento, em <http://localhost:3000>. Recarrega ao salvar. |
| `npm run build` | Gera o build de produção (o mesmo que a Vercel faz). |
| `npm start` | Roda o build de produção localmente. |
| `npm run typecheck` | Verifica os tipos do TypeScript. |
| `npm run lint` | Procura problemas de código com o ESLint. |
| `npm test` | Roda os testes unitários. Não precisa de rede nem de banco. |
| `npm run check` | Tudo acima em sequência (tipos, lint, testes, build). |
| `npm run job:daily` | Coleta + alertas + relatório, igual ao agendamento. |
| `npm run job:collect` | Só a coleta. |
| `npm run job:report` | Alertas + relatório, sem coletar. |
| `npm run job:test-notify` | Mensagem de teste aos canais habilitados. |
| `npm run ml:auth` | Autorização do Mercado Livre (veja a etapa 2). |
| `npm run env:check` | Mostra quais variáveis estão preenchidas, sem exibir valores. |
| `npm run test:integration` | Teste com banco real **local** (veja abaixo). |

## Como saber se está tudo funcionando

1. `npm run check` termina sem erro.
2. O login funciona e a Visão geral abre.
3. Você cadastra um produto, cola um link do Mercado Livre e o “Consultar agora” mostra “Preço atualizado.”.
4. Em **Configurações**, os canais que você usa aparecem com o ícone de confirmado, e o teste de envio chega.
5. Em **Coletas e envios**, aparecem a execução “Pelo painel” e a notificação de teste.

## Testes

```bash
npm test
```

São testes unitários com Vitest, sem rede. As chamadas ao Mercado Livre, Telegram etc. são simuladas. O que cada arquivo testa está no [guia de leitura do código](03-guia-de-leitura-do-codigo.md#testes-automatizados).

O teste de integração usa um Supabase **local** (precisa de Docker) e apaga os dados desse banco local. Por segurança, ele só roda com `INTEGRATION_ALLOW_RESET=true` e URL apontando para `localhost`/`127.0.0.1`:

```bash
npx supabase start
npx supabase db reset
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_SERVICE_ROLE_KEY=<service_role local> \
SUPABASE_ANON_KEY=<anon local> \
INTEGRATION_ALLOW_RESET=true npm run test:integration
```

## Erros comuns

| Sintoma | Causa e solução |
|---|---|
| “Falta conectar o banco de dados” | `SUPABASE_URL` ou `SUPABASE_SERVICE_ROLE_KEY` vazias. Rode `npm run env:check`. |
| O login volta sempre para a tela de senha | `SESSION_SECRET` com menos de 32 caracteres. |
| “Muitas tentativas” no login | São 5 tentativas a cada 15 minutos por IP. Espere ou reinicie o `npm run dev`, já que o contador fica em memória. |
| “relation … does not exist” | A migração não foi aplicada. |
| `EBADENGINE` no `npm ci` | Você está fora do Node 22. Rode `nvm use`. |
| `node: bad option: --env-file-if-exists` | Node mais antigo que 22.9. |
| Oferta com “Erro de autenticação” | Token do Mercado Livre ausente ou revogado. Rode `npm run ml:auth` de novo. |
| `invalid_grant` no `ml:auth` | Código expirado ou já usado, ou `ML_REDIRECT_URI` diferente da cadastrada. |
| “Não encontramos o código do anúncio” | Link encurtado ou de lista. Abra a página do produto e copie o endereço completo com `MLB`. |
| Telegram “chat not found” | Você não mandou mensagem ao bot antes, ou o chat id está errado. |
| Resend “from address is not verified” | Use `onboarding@resend.dev` (só para o seu e-mail) ou verifique um domínio. |
