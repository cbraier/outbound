# Outbound Sales

App de prospecção por foto + gerador de propostas com IA: tira foto da fachada → cria o lead → IA escreve a abordagem → WhatsApp → kanban. A conversa do WhatsApp vira escopo, prazo e PDF profissional com a marca do vendedor.

## Stack
- React + Vite + TypeScript + Tailwind (tema Porquinho)
- Supabase (auth + banco + edge functions) — projeto `abqlddgmgtfmnhqujusw`
- Capacitor (iOS) + RevenueCat para pacotes consumíveis de Doods
- Vercel → `outbound.zonn.com.br`

## Kanban (verticais)
`Lead` (salvou a foto) → `Prospect` (enviou a mensagem) → `Negociando` (respondeu no WhatsApp) → `Fechado` → `Pós-Vendas`
- Foto salva → cria em **Lead**
- Enviar mensagem → move p/ **Prospect**
- Resposta no WhatsApp (não-automática) → move p/ **Negociando**

## Propostas com IA
Aba **Proposta**:
- Cole a conversa do WhatsApp ou envie até 3 prints.
- A IA extrai o pedido, monta o escopo, estima prazo e investimento.
- Tudo é editável antes do PDF.
- O PDF usa logo, empresa, site e cor da marca configurados em **Perfil → Marca das propostas**.
- Histórico local + sincronização dos JSON/PDFs no bucket `profile_docs`.

Custo: `proposal_analyze` = **10 Doods** (R$ 0,10). O PDF é gerado no aparelho e não consome Doods extras.

## Monetização — Doods
- `1 Dood = R$ 0,01`. Boas-vindas: **200 Doods** por conta nova.
- Toda ação de IA consome Doods via `charge_wallet`; o que não usa IA é livre.
- Recarga no app por IAP consumível (RevenueCat → webhook em `dood`).
- Produtos iOS:
  - `com.braier.outbound.dood1000` — R$ 10 — 1.000 Doods
  - `com.braier.outbound.dood2000` — R$ 20 — 2.000 Doods
  - `com.braier.outbound.dood5000` — R$ 50 — 5.000 Doods
  - `com.braier.outbound.dood10000` — R$ 100 — 10.000 Doods
  - `com.braier.outbound.dood50000` — R$ 500 — 50.000 Doods
- Preços por ação ficam na tabela `pricing` (`app = outbound`).
- A migração `supabase/migrations/20261017_proposal_pricing.sql` registra a ação da proposta.
- A migração `supabase/migrations/20261017_doods_rls.sql` fecha o acesso direto do cliente a `wallets`, `ledger`, `pricing`, `iap_*` e `usage_log` e revoga `EXECUTE` de `charge_wallet`/`credit_wallet` para `anon`/`authenticated`. Só a edge function (service_role) mexe na carteira.
- A migração `supabase/migrations/20261017_storage_rls.sql` restringe `profile_docs` e `lead_photos` à pasta do próprio usuário; os buckets seguem públicos apenas para leitura por URL (logo, PDF e fotos).

## Edge functions (deployadas)
- `ai-message` — mensagens, visão, áudio, enrich, descoberta, entrevista, currículo e **proposta** (texto e prints). Provider-agnóstico: Gemini/OpenAI/Claude/DeepSeek padrão ou BYO-key no Perfil.
- `reverse-geocode` — endereço do GPS/EXIF (Nominatim + fallback Photon).
- `dood` — carteira, extrato, cobrança, recarga e webhook RevenueCat.
- `delete-account` — exclusão da conta.

## Variáveis (Supabase secrets)
- `GEMINI_API_KEY` e/ou `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `DEEPSEEK_API_KEY`
- `EXA_API_KEY` / `TAVILY_API_KEY` (pesquisa)
- `GOOGLE_PLACES_API_KEY` (opcional, descoberta)
- `RC_WEBHOOK_SECRET` (webhook RevenueCat)

## Banco
- `profiles` — dados do usuário + `ai_instruction`, `professional_profile`, `fixed_message`, `ai_provider`, `ai_api_key`, `site`, `socials` (inclui `_logo` e `_brand_color`), `full_access`.
- `leads` — nome, telefone, rede_social, site, endereço, categoria, tags[], foto_url, lat/lng, mensagem, etapa, last_contact_at.
- `wallets`, `ledger`, `pricing`, `usage_log`, `iap_products`, `iap_transactions` — núcleo Doods.
- bucket `lead_photos` (fotos) e `profile_docs` (currículo, logo e propostas).

## Env do app (`.env.local`)
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_REVENUECAT_IOS_KEY`
