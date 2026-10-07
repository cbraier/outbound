# Outbound Sales

App de prospecção por foto: tira foto da fachada → cria o lead → IA escreve a abordagem → WhatsApp → kanban.

## Stack
- React + Vite + TypeScript + Tailwind (tema Porquinho)
- Supabase (auth + banco + edge functions) — projeto `abqlddgmgtfmnhqujusw`
- Capacitor (iOS) + RevenueCat (3 dias grátis, depois R$ 29,90/mês)
- Vercel → `outbound.zonn.com.br`

## Kanban (verticais)
`Lead` (salvou a foto) → `Prospect` (enviou a mensagem) → `Negociando` (respondeu no WhatsApp) → `Fechado` → `Pós-Vendas`
- Foto salva → cria em **Lead**
- Enviar mensagem → move p/ **Prospect**
- Resposta no WhatsApp (não-automática) → move p/ **Negociando**

## Edge functions (deployadas)
- `ai-message` — gera a mensagem personalizada. Provider-agnóstico: Gemini (padrão), ou BYO-key (Gemini/GPT/Claude) definido no Perfil.
- `reverse-geocode` — endereço do GPS/EXIF (Nominatim + fallback Photon).

## Variáveis (Supabase secrets)
- `GEMINI_API_KEY` (padrão grátis) e/ou `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` (fallback do app).

## Banco
- `profiles` — dados do usuário + `ai_instruction`, `professional_profile`, `fixed_message`, `ai_provider`, `ai_api_key`, `site`.
- `leads` — nome, telefone, rede_social, site, endereço, categoria, tags[], foto_url, lat/lng, mensagem, etapa, last_contact_at.
- bucket `lead_photos` (público).

## Env do app (`.env.local`)
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_REVENUECAT_IOS_KEY`.
