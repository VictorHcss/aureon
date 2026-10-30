# Relatório de testes da entrega original

> Documento histórico, da versão anterior ao Aureon. A verificação da reformulação está em [RELATORIO-AUREON.md](RELATORIO-AUREON.md).

Este relatório registra a verificação feita em 27/10/2026, no ambiente de desenvolvimento usado para gerar o projeto (Linux, Node.js 22.22, npm 10.9). A rede desse ambiente **não tinha acesso** a `api.mercadolibre.com`, Telegram, Resend, Meta, Supabase em nuvem, GitHub e Vercel. Por isso, as integrações externas estão **implementadas, mas não validadas com os serviços reais**.

## Executado e aprovado

| Verificação | Comando | Resultado |
|---|---|---|
| Tipos (TypeScript estrito) | `npm run typecheck` | sem erros |
| Lint (ESLint + regras do Next) | `npm run lint` | 0 erros, 0 avisos |
| Testes unitários | `npm test` | **103 de 103** aprovados, 11 arquivos |
| Build de produção | `npm run build` | concluído |
| Auditoria de dependências de produção | `npm audit --omit=dev` | 0 vulnerabilidades |
| Migração SQL | aplicada em PostgreSQL 16.15 | sem erros |
| Teste de integração (banco real) | `npm run test:integration` contra PostgreSQL 16 + PostgREST 12.2.12, o mesmo servidor de API que o Supabase usa, com os papéis `anon`/`service_role` simulados | **7 de 7** aprovados |

### Restrições do banco verificadas diretamente no PostgreSQL

Cada caso abaixo foi recusado pelo banco, como esperado:

- sucesso com preço nulo ou zero;
- oferta duplicada para o mesmo produto;
- URL sem https;
- duas execuções com a mesma chave diária;
- segunda linha de configurações;
- nome de produto em branco;
- tipo de regra inválido.

Uma falha sem preço foi aceita, como deve ser. A chave `anon` recebeu “permission denied”, e a `service_role` leu normalmente.

### Teste de ponta a ponta do script diário (sem acesso à API real)

- `scripts/daily.ts` rodou contra o banco local. As duas consultas ao Mercado Livre falharam por bloqueio de rede e foram registradas como **Falha temporária**. A execução ficou como `failed`, com resumo dos erros, e o processo terminou com código 1 e anotação `::error::`. O último preço válido foi preservado.
- `--test-notify` com Telegram habilitado: a falha de rede foi registrada em `notification_logs`, e o token **não apareceu** no log.

### Painel rodando em produção local (`next start`)

- Sem sessão: `/` redireciona para `/login` (307), POST retorna 401 e cookie adulterado é recusado.
- Com sessão: `/`, `/produtos` (inclusive com filtros), `/produtos/novo`, `/execucoes`, `/configuracoes` e a página de produto responderam 200, exibindo dados reais do banco. A página de produto mostrou comparação entre lojas, “melhor oferta”, preço R$ 389,90, status “Falha temporária” e histórico.
- Produto inexistente mostrou a página 404. `/ml-callback` mostrou o comando com o código, e conteúdo com `<script>` não foi interpretado.
- Os cabeçalhos `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` e `Referrer-Policy` estavam presentes.

## Não validado (depende de credenciais ou de acesso externo)

| Item | Como validar |
|---|---|
| API real do Mercado Livre, incluindo `sale_price` e `shipping_options` | `npm run ml:auth` e depois `npm run ml:auth -- --test=<URL>` |
| Envio real pelo Telegram | Painel → Configurações → Testar Telegram |
| Envio real pelo Resend | Painel → Configurações → Testar e-mail |
| WhatsApp Cloud API | `docs/whatsapp.md` e depois Testar WhatsApp |
| Supabase em nuvem | aplicar a migração e abrir o painel |
| GitHub Actions (agendamento e execução manual) | Actions → Coleta diária → Run workflow |
| Deploy na Vercel | importar o repositório e configurar as variáveis |
| Login pelo navegador (Server Action) e uso visual do painel | abrir o painel e entrar com `ADMIN_PASSWORD` |
