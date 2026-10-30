# WhatsApp Cloud API (integração opcional)

O código está pronto (`src/lib/notify/whatsapp.ts`), mas o canal vem **desligado**. Ative-o só depois de concluir os passos abaixo. Esta é a API oficial da Meta; o projeto não usa automações do WhatsApp Web.

## O que é preciso

1. **Conta Meta Business** (<https://business.facebook.com>) e um **app** em <https://developers.facebook.com>, tipo *Business*, com o produto **WhatsApp** adicionado.
2. **Número de telefone.** A Meta oferece um número de teste, que envia para até 5 destinos cadastrados e serve para validar. Para uso contínuo, você precisa de um número próprio que **não** esteja em uso no app WhatsApp comum.
3. **Token permanente.** Em Business Settings → *System users*, crie um usuário do sistema com permissão `whatsapp_business_messaging` e gere o token. Os tokens temporários do painel do app expiram em 24 h.
4. **Modelo de mensagem aprovado.** Mensagens iniciadas pela empresa (como alertas e relatórios) exigem modelo. Crie em WhatsApp Manager → *Message templates*:
   - Nome: `alerta_preco`
   - Categoria: **Utility**
   - Idioma: Portuguese (BR), código `pt_BR`
   - Corpo: `Aureon: {{1}}` (se você já tem um modelo aprovado com outro texto, ele continua funcionando: o código só preenche a variável `{{1}}`)
   - Exemplo da variável: `Preço-alvo atingido: SSD 1TB. Loja: Mercado Livre. Preço atual: R$ 389,90 ...`

   A aprovação costuma levar de minutos a algumas horas. A Meta pode reclassificar a categoria.
5. **Consentimento.** Só envie para números que concordaram em receber mensagens (no uso pessoal, o seu próprio número).

## Variáveis

```
WHATSAPP_TOKEN=...               # secret
WHATSAPP_PHONE_NUMBER_ID=...     # ID do número (não é o telefone), em WhatsApp → API Setup
WHATSAPP_TO=5511999998888        # destino, formato internacional só com dígitos
WHATSAPP_TEMPLATE_NAME=alerta_preco
WHATSAPP_TEMPLATE_LANG=pt_BR
WHATSAPP_API_VERSION=v23.0       # confira a versão atual da Graph API
```

Cadastre-as na Vercel (para o botão de teste) e no GitHub Actions: o token e o ID como *Secrets*, o resto como *Variables*. Depois, no painel, vá em **Configurações**, marque “Enviar pelo WhatsApp”, salve e clique em **Testar WhatsApp**.

## Como o envio funciona

- Cada mensagem é um modelo com **um** parâmetro de texto. O sistema transforma o conteúdo em uma linha: a Meta não aceita quebras de linha, tabulações ou 4+ espaços seguidos em parâmetros. O texto é limitado a 1.000 caracteres.
- O resumo diário via WhatsApp é curto (totais e um destaque). O detalhe vai por e-mail e Telegram.
- Erros da Meta, como modelo inexistente (código 132001), número inválido ou falta de pagamento, ficam registrados em **Coletas e envios** sem expor o token.
- A deduplicação é a mesma dos outros canais: cada evento é enviado uma única vez.

## Custos

A Meta cobra por mensagem de modelo entregue. O valor depende da categoria (*utility*, *marketing*, *authentication*) e do país do destinatário. Consulte a tabela atual em <https://developers.facebook.com/docs/whatsapp/pricing> e cadastre uma forma de pagamento na conta. Sem ela, os envios com o número próprio falham.
