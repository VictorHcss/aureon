# Coletor: Mercado Livre (API oficial)

Arquivo: `src/lib/collectors/mercadolivre.ts`. Os testes, com respostas simuladas, estão em `tests/mercadolivre.test.ts`.

## Como funciona

O coletor **não acessa a página HTML** do anúncio. A URL cadastrada serve apenas para extrair o código `MLB`. A consulta é feita na API oficial `https://api.mercadolibre.com`, com o token OAuth do seu aplicativo.

| URL cadastrada | Identificador salvo | Consulta |
|---|---|---|
| `produto.mercadolivre.com.br/MLB-1234567890-...` | `item:MLB1234567890` | `GET /items/MLB1234567890` |
| `www.mercadolivre.com.br/.../p/MLB12345678` | `catalog:MLB12345678` | `GET /products/MLB12345678` → `buy_box_winner` |
| `.../p/MLB12345678?wid=MLB9876543210` | `item:MLB9876543210` | anúncio específico indicado por `wid` |
| `MLB1234567890` (código puro) | `item:MLB1234567890` | `GET /items/...` |

Etapas extras, todas opcionais e sem interromper a coleta se falharem:

- `GET /items/{id}/sale_price?context=channel_marketplace` traz o preço promocional vigente (`amount`) e o preço “de” (`regular_amount`). Se não estiver disponível, o coletor usa `price` do anúncio. O campo `metadata.price_source` registra qual foi usado.
- `GET /items/{id}/shipping_options?zip_code=CEP` só é chamado quando `ML_ZIP_CODE` está definido e o frete não é grátis. O coletor usa o menor `cost`.

> Confira na documentação oficial (<https://developers.mercadolivre.com.br>) se os endpoints e parâmetros continuam iguais. A API muda com o tempo. Se o formato da resposta mudar, o coletor marca **Estrutura alterada** em vez de gravar um preço errado.

## Dados obtidos

Preço à vista (BRL), preço original quando há desconto, frete (0 quando grátis, valor com CEP, ou nulo quando desconhecido), disponibilidade, vendedor (`seller_id`), título, link oficial (`permalink`) e quantidade disponível.

## Interpretação de respostas

| Situação | Status gravado | Preço |
|---|---|---|
| Anúncio ativo, preço válido em BRL | `success` | gravado |
| `status` ≠ `active` ou estoque 0 | `unavailable` | nulo; o último preço visto fica em `metadata.last_seen_price` |
| HTTP 404 | `unavailable` | nulo |
| HTTP 401 | renova o token e tenta uma vez; se persistir, `auth_error` | nulo |
| HTTP 403 | `auth_error` | nulo |
| HTTP 429 / 5xx / rede / timeout | repete até 2 vezes com espera; depois `temporary_failure` | nulo |
| JSON em formato inesperado | `structure_changed` | nulo |
| Preço ausente, zero ou negativo | `price_not_found` | nulo |
| Moeda diferente de BRL | `structure_changed` | nulo |
| Catálogo sem oferta vencedora | `unavailable` | nulo |

O banco reforça essas regras: a restrição `price_history_success_has_price` impede gravar sucesso sem preço positivo. Falhas nunca alteram `last_success_at` nem o último preço válido.

## Autenticação

- O OAuth 2.0 usa *authorization code*. Rode `npm run ml:auth` uma vez para obter o código.
- O `access_token` vale cerca de 6 horas. O `refresh_token` é de **uso único**: o sistema guarda o novo a cada renovação na tabela `integration_tokens`.
- Se a renovação falhar (token revogado ou senha alterada), as consultas passam a `auth_error` e o relatório mostra as falhas. Para resolver, rode `npm run ml:auth` de novo.

## Limites e termos

- **Custo:** a API é gratuita para aplicativos registrados.
- **Limites de taxa:** não há números publicados de forma detalhada. O coletor espera 400 ms entre requisições (`COLLECTOR_MIN_INTERVAL_MS`) e trata 429. Com 30 ofertas por dia, o volume é muito baixo.
- **Termos de uso:** use os dados para consulta pessoal, respeitando os termos do programa de desenvolvedores do Mercado Livre. Não redistribua os dados.
- **Frequência:** uma vez por dia, mais as consultas manuais pelo painel (no máximo uma por minuto por oferta).

## Diagnóstico rápido

```bash
npm run ml:auth -- --test=MLB1234567890
```

Esse comando mostra o `CollectorResult` completo (status, preço, frete, erro) sem gravar nada no histórico.
