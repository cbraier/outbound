# Outbound Sales — Metadata App Store Connect

## Estado da submissão — 17/10/2026
- **Versão:** 1.0 · **build 6** (upload 17/10/2026, `VALID`).
- **Review submission:** `e91122c3-e91e-41f7-b0c1-ca835b28e4b8` — app + 5 IAPs, `WAITING_FOR_REVIEW`.
- **IAPs:** os 5 consumíveis de Dood's estão `WAITING_FOR_REVIEW` junto da versão (preço, localização pt-BR, disponibilidade e screenshot de revisão configurados).
- **Screenshot de revisão dos IAPs:** `asc/doods-review.png` (1290×2796).
- **Screenshots do app:** `asc/out/6.7/09-proposta.png` e `10-doods.png` (e versões 6.5 em `asc/out/6.5/`).
- **Edge function `ai-message`:** deployada com a ação `proposal` (texto + prints) e provider chain padrão/BYO.
- **Produção web:** `https://outbound.zonn.com.br` republicada com o modelo Dood's + Propostas.
- **Custo da proposta:** `proposal_analyze` = 10 Doods (R$ 0,10). PDF no aparelho, sem custo extra.
- **Segurança:** RLS + revogação de EXECUTE em `wallets`/`ledger`/`pricing`/`iap_*`/`usage_log`; Storage restrito à pasta do usuário (`profile_docs`/`lead_photos`). Testado: anon não lê carteira nem chama `credit_wallet`; welcome de 200 Doods continua funcionando.
- **Screenshots:** 09/10 novas já na ASC; conjunto final pronto em `asc/out/6.7/final-*.png` e `6.5/final-*.png` para trocar após aprovação (a ASC bloqueia exclusão depois do envio).
- **Pendências pós-aprovação:** testar compra de Dood's no sandbox e o webhook do RevenueCat; se os consumíveis não aparecerem, incluí-los na offering `default`; conferir App Privacy (rótulos) na UI da ASC (incluir Histórico de Compras e Conteúdo do Usuário); opcionalmente remover a assinatura antiga `outbound_pro_monthly` (não usada); centralizar a carteira no projeto Dood (hoje o Outbound tem Supabase/carteira próprios).

## Básico
- **App Name (30):** Outbound Sales
- **Subtitle (30):** Prospecção e propostas com IA
- **Bundle ID:** com.braier.outbound
- **SKU:** outboundsales
- **App ID (ASC):** 6820283419
- **Copyright:** 2026 Zonn Smart Solutions
- **Categoria primária:** Negócios (Business)
- **Categoria secundária:** Produtividade
- **Classificação etária:** 4+
- **Idioma principal:** Português (Brasil)

## URLs
- **Privacy Policy URL:** https://legal.zonn.pro/privacidade
- **Support URL:** https://legal.zonn.pro/suporte
- **Marketing URL:** https://outbound.zonn.com.br

## Promotional Text (170)
Fotografe a fachada e o lead nasce pronto no seu funil. A IA escreve a abordagem e ainda transforma a conversa do WhatsApp em proposta com escopo, prazo e PDF profissional.

## Keywords (100)
prospecção,leads,vendas,crm,funil,whatsapp,ia,proposta,orçamento,site,app,corretor

## Description (4000)
Outbound Sales é o app de prospecção ativa para quem vende de porta em porta e de WhatsApp em WhatsApp — e agora também fecha propostas em minutos.

Fotografe a fachada do comércio e o lead é criado automaticamente: nome, telefone, redes sociais, endereço e categoria — prontos no seu funil, sem digitar quase nada.

PROPOSTAS COM IA
• Cole a conversa do WhatsApp ou envie prints do atendimento.
• A IA entende o pedido e monta o escopo de site, aplicativo ou sistema sob medida.
• Estima o prazo de entrega e uma faixa de investimento.
• Você revisa tudo e gera um PDF profissional com a sua marca, em minutos.
• Histórico de propostas salvo na sua conta.

COMO FUNCIONA
• Tire a foto da fachada (ou escolha da galeria). A IA lê os dados da imagem na hora.
• O lead entra no funil: Lead → Prospect → Negociando → Fechado → Pós-Vendas.
• Gere uma mensagem personalizada por IA para cada ramo e envie no WhatsApp.
• Descubra negócios por setor dentro do seu raio de atendimento, já ordenados pelos mais próximos de você.
• Acompanhe tudo no mapa (Radar) e organize seus follow-ups na Agenda.

PARA QUEM VENDE TODO DIA
Corretores, prestadores de serviço, representantes, consultores, agências e pequenos negócios que prospectam na região. Defina sua área de atendimento, encontre clientes perto de você e nunca perca um retorno.

RECURSOS
• Cadastro por foto, imagem, áudio ou manual
• Funil de vendas em 5 etapas, com busca e tags
• Mensagens com IA que usam o seu perfil e o seu currículo
• Gerador de propostas com IA + PDF com a sua marca
• Descoberta de negócios por setor e raio de atendimento
• Radar no mapa e Agenda com lembretes
• Ditado por voz e leitura de currículo (PDF/DOCX)

CRÉDITOS DOOD'S
O app usa Dood's, créditos que você só gasta quando usa IA. A conta nova recebe 200 Dood's de boas-vindas. 1 Dood = R$ 0,01. Recargas de R$ 10, R$ 20, R$ 50, R$ 100 e R$ 500 são compradas dentro do app e não expiram. O que não usa IA continua livre.

Privacidade: https://legal.zonn.pro/privacidade
Termos: https://legal.zonn.pro/termos
Suporte: https://legal.zonn.pro/suporte

## App Review Information
- **Sign-in required:** Yes (há cadastro por e-mail/senha e conta demo abaixo).
- **Conta demo:** `review@outbound.zonn.com.br` / `Outbound2026!`
- **Saldo da conta demo:** 127 Dood's (suficiente para testar todas as ações de IA).
- **Notes:**
  "Conta de demonstração: review@outbound.zonn.com.br / Outbound2026!. O app permite cadastrar leads por foto (câmera), imagem, áudio ou manual, gerenciar um funil de 5 etapas, descobrir negócios por setor dentro do raio de atendimento e ver tudo no mapa. Em cada lead, 'Elaborar com IA' gera a mensagem. Na aba 'Proposta', cole uma conversa de WhatsApp (ou envie prints) e toque em 'Gerar proposta com IA': o app monta escopo, prazo e investimento, permite revisar e gera um PDF com a marca do Perfil. O app usa Dood's (créditos consumíveis): a conta demo já tem saldo; a recarga é feita por IAP consumível (1.000 a 50.000 Dood's). Não há assinatura. Exclusão de conta em Perfil → Excluir minha conta."

## In-App Purchases (consumíveis)
| Produto | Preço BR | Dood's |
|---|---|---|
| `com.braier.outbound.dood1000` | R$ 10 | 1.000 |
| `com.braier.outbound.dood2000` | R$ 20 | 2.000 |
| `com.braier.outbound.dood5000` | R$ 50 | 5.000 |
| `com.braier.outbound.dood10000` | R$ 100 | 10.000 |
| `com.braier.outbound.dood50000` | R$ 500 | 50.000 |

Cada IAP precisa de: localização pt-BR, preço no Brasil, disponibilidade em todos os territórios e **screenshot de revisão** mostrando a tela de recarga da aba Dood's.

## App Privacy (rótulos)
Responder "Sim, coletamos dados" e marcar:
- **Dados de contato → E-mail** (vinculado ao usuário; finalidade: Funcionalidade do app)
- **Dados de contato → Nome** (vinculado; Funcionalidade)
- **Informações de contato → Número de telefone** (dos leads; vinculado; Funcionalidade)
- **Localização → Localização precisa** (foto tirada na hora; vinculado; Funcionalidade)
- **Conteúdo do usuário → Fotos ou vídeos** (fotos dos leads e prints de conversa; vinculado; Funcionalidade)
- **Conteúdo do usuário → Outro conteúdo do usuário** (mensagens, conversas e propostas; vinculado; Funcionalidade)
- **Compras → Histórico de compras** (Dood's; vinculado; Funcionalidade)
- **NÃO** marcar "Usado para rastrear" em nada.
- **Compartilhamento com terceiros:** os dados de texto/imagem são processados por provedores de IA (OpenAI/Google/Anthropic/DeepSeek) e serviços de busca (Exa/Tavily) apenas para gerar as respostas do app.

## Screenshots
Tamanhos exigidos (iPhone):
- 6.7" / 6.9" → 1290 x 2796
- 6.5" → 1242 x 2688

Sugestão de telas: Novo, Proposta (conversa + PDF), Dood's (saldo + recarga), Funil, Radar, Agenda, Perfil. Originais em `asc/screenshots/`; script de ajuste `asc/make-screenshots.sh`.
