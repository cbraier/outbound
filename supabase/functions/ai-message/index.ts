import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

function osmFilter(sector: string): string {
  const s = (sector || "").toLowerCase();
  const map: [RegExp, string][] = [
    [/mec[aâ]nic|oficina|auto ?center|funilar|car ?repair/, '["shop"="car_repair"]'],
    [/supermerc|mercado|hipermerc|mercearia/, '["shop"="supermarket"]'],
    [/restaurant|pizzar|churrasc/, '["amenity"="restaurant"]'],
    [/lanch|hamburg|fast ?food|hot ?dog/, '["amenity"="fast_food"]'],
    [/caf[eé]|cafeteria/, '["amenity"="cafe"]'],
    [/padaria|panific/, '["shop"="bakery"]'],
    [/a[çc]ougue|carnic/, '["shop"="butcher"]'],
    [/farmac|drogaria/, '["amenity"="pharmacy"]'],
    [/barbear|barber/, '["shop"="hairdresser"]'],
    [/sal[aã]o|beleza|est[eé]tic|manicur/, '["shop"="beauty"]'],
    [/pet ?shop|petshop|veterin/, '["shop"="pet"]'],
    [/academia|fitness|crossfit|pilates/, '["leisure"="fitness_centre"]'],
    [/cl[ií]nica|consult[oó]rio|odonto|dent/, '["amenity"="clinic"]'],
    [/pousada|hotel|hot[eé]l|hostel|ch[aá]l[eé]|camping|hospedagem|apart.?hotel|flat|inn/, '["tourism"~"hotel|guest_house|hostel|chalet|apartment|motel|camp_site|caravan_site|guesthouse",i]'],
    [/roupa|moda|boutique|vestu/, '["shop"="clothes"]'],
    [/sapato|cal[çc]ado|t[eê]nis/, '["shop"="shoes"]'],
    [/m[oó]veis|decora|moveleir/, '["shop"="furniture"]'],
    [/material de constru|constru[çc]/, '["shop"="doityourself"]'],
    [/papelaria/, '["shop"="stationery"]'],
    [/[oó]tica|[oó]culos/, '["shop"="optician"]'],
    [/conveni[eê]ncia|adega|bebida/, '["shop"="convenience"]'],
    [/flor|jardin/, '["shop"="florist"]'],
    [/eletr[oô]nic|inform[aá]tic|celular/, '["shop"="electronics"]'],
    [/loja|com[eé]rcio|varejo/, '["shop"]'],
  ];
  for (const [re, f] of map) if (re.test(s)) return f;
  const kw = (sector || "").replace(/["\\]/g, "").slice(0, 30).trim();
  return kw ? `["name"~"${kw}",i]` : '["shop"]';
}

function osmTag(sector: string): string {
  const s = (sector || "").toLowerCase();
  const map: [RegExp, string][] = [
    [/mec[aâ]nic|oficina|auto ?center|funilar|car ?repair/, "shop:car_repair"],
    [/supermerc|mercado|hipermerc|mercearia/, "shop:supermarket"],
    [/pizzar|churrasc|restaurante/, "amenity:restaurant"],
    [/lanch|hamburg|fast ?food|hot ?dog|cachorro ?quente/, "amenity:fast_food"],
    [/caf[eé]|cafeteria/, "amenity:cafe"],
    [/padaria|panific/, "shop:bakery"],
    [/a[çc]ougue|carnic/, "shop:butcher"],
    [/farmac|drogaria/, "amenity:pharmacy"],
    [/barbear|barber/, "shop:hairdresser"],
    [/sal[aã]o|beleza|est[eé]tic|manicur/, "shop:beauty"],
    [/pet ?shop|petshop|veterin/, "shop:pet"],
    [/academia|fitness|crossfit|pilates/, "leisure:fitness_centre"],
    [/cl[ií]nica|consult[oó]rio|odonto|dent/, "amenity:clinic"],
    [/pousada|hotel|hot[eé]l|hostel/, "tourism:hotel"],
    [/roupa|moda|boutique|vestu/, "shop:clothes"],
    [/sapato|cal[çc]ado|t[eê]nis/, "shop:shoes"],
    [/m[oó]veis|decora|moveleir/, "shop:furniture"],
    [/material de constru|constru[çc]/, "shop:doityourself"],
    [/papelaria/, "shop:stationery"],
    [/[oó]tica|[oó]culos/, "shop:optician"],
    [/conveni[eê]ncia|adega|bebida/, "shop:convenience"],
    [/flor|jardin/, "shop:florist"],
  ];
  for (const [re, t] of map) if (re.test(s)) return t;
  return "";
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function parseJson(text: string): Record<string, unknown> | null {
  if (!text) return null;
  let t = text.replace(/```json?\n?/gi, "").replace(/```/g, "").trim();
  const s = t.indexOf("{");
  const e = t.lastIndexOf("}");
  if (s >= 0 && e > s) t = t.slice(s, e + 1);
  try { return JSON.parse(t); } catch { return null; }
}

async function fetchTimeout(input: RequestInfo | URL, init: RequestInit = {}, ms = 30000): Promise<Response> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(input, { ...init, signal: init.signal ?? ctrl.signal });
  } finally {
    clearTimeout(to);
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Custo por 1M tokens (US$) — DeepSeek Flash (peak). Ajuste aqui se mudar.
const COST = {
  in_miss: 0.30, in_hit: 0.006, out: 1.20, // deepseek-flash peak
  usd_brl: 5.5,
};
type Usage = { provider: string; model: string; prompt_tokens: number; completion_tokens: number; cache_hit: number; cache_miss: number };
let lastUsage: Usage | null = null;
function setUsage(provider: string, model: string, usage: Record<string, unknown> | undefined | null) {
  if (!usage) return;
  lastUsage = {
    provider, model,
    prompt_tokens: Number(usage.prompt_tokens ?? 0),
    completion_tokens: Number(usage.completion_tokens ?? 0),
    cache_hit: Number(usage.prompt_cache_hit_tokens ?? 0),
    cache_miss: Number(usage.prompt_cache_miss_tokens ?? usage.prompt_tokens ?? 0),
  };
}
async function logUsage(admin: ReturnType<typeof createClient>, uid: string | undefined, app: string, action: string) {
  const u = lastUsage; lastUsage = null;
  if (!uid || !u) return;
  const costBrl = ((u.cache_miss / 1e6) * COST.in_miss + (u.cache_hit / 1e6) * COST.in_hit + (u.completion_tokens / 1e6) * COST.out) * COST.usd_brl;
  try {
    await admin.from("usage_log").insert({
      user_id: uid, app, action, provider: u.provider, model: u.model,
      prompt_tokens: u.prompt_tokens, completion_tokens: u.completion_tokens,
      cache_hit_tokens: u.cache_hit, cache_miss_tokens: u.cache_miss, cost_brl: Number(costBrl.toFixed(6)),
    });
  } catch { /* ignora */ }
}

const STYLE = `
Você ajuda um vendedor a escrever UMA mensagem de prospecção por WhatsApp para um comércio/empresa.
Escreva como uma pessoa de verdade: brasileiro, informal, próximo, de bairro — NUNCA com cara de IA, NUNCA corporativo, sem emoji em excesso, SEM travessão (—).
Regras:
- Comece com: "Olá, tudo bem? {saudacao}!" e uma linha em branco.
- Primeiro identifique o SEGMENTO pelo nome e dados do prospect.
- Depois ofereça, com naturalidade, de 1 a 3 serviços DO USUÁRIO (do perfil abaixo) que resolvem a dor daquele tipo de negócio. NÃO liste tudo.
- Cite o nome do estabelecimento de forma natural. NÃO é obrigatório falar de região.
- Ao se referir a VOCÊ (vendedor) e de onde atende, use no máximo "aqui na minha região". PROIBIDO inventar cidades ou região.
- Termine convidando para uma conversa sem compromisso, com simpatia.
- 3 a 4 parágrafos curtos, texto corrido. Português do Brasil. Sem markdown.
- Mantenha LITERALMENTE os placeholders {saudacao}, {estabelecimento} e {site}.
`.trim();

interface In {
  lead?: Record<string, unknown>;
  instruction?: string;
  professional_profile?: string;
  provider?: string;
  api_key?: string;
  image_base64?: string;
  audio_base64?: string;
  audio_mime?: string;
  action?: string;
  nome?: string;
  company?: string;
  site?: string;
  city?: string;
  phone?: string;
  region?: string;
  radius?: number;
  sector?: string;
  limit?: number;
  lat?: number;
  lng?: number;
  socials?: Record<string, string>;
  instrucao?: string;
  seller_region?: string;
  history?: { q: string; a: string }[];
  context?: Record<string, unknown>;
  conversation?: string;
  images?: string[];
  project_type?: string;
  notes?: string;
  brand?: Record<string, unknown>;
}

// Remove cidades do VENDEDOR que a IA inventou para o prospect.
function scrubSellerCities(msg: string, cities: string[], allowed: string): string {
  let out = msg;
  const allowedLc = (allowed || "").toLowerCase();
  for (const c of cities) {
    const city = (c || "").trim();
    if (city.length < 4) continue;
    if (allowedLc && allowedLc.includes(city.toLowerCase())) continue;
    const esc = city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out
      .replace(new RegExp(`(a[íi]|aqui)?\\s*em\\s+${esc}(\\s+e\\s+regi[ãa]o)?`, "gi"), (_m, p1) => (p1 ? `${p1} na sua região` : "na sua região"))
      .replace(new RegExp(`${esc}(\\s+e\\s+regi[ãa]o)?`, "gi"), "sua região");
  }
  return out.replace(/\s{2,}/g, " ").replace(/\s+([,.!?])/g, "$1").trim();
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function runChain(system: string, user: string): Promise<string> {
  const errs: string[] = [];
  const chain: Array<[string | undefined, () => Promise<string>]> = [
    [Deno.env.get("DEEPSEEK_API_KEY"), () => callDeepSeek(Deno.env.get("DEEPSEEK_API_KEY")!, system, user)],
    [Deno.env.get("OPENAI_API_KEY"), () => callOpenAI(Deno.env.get("OPENAI_API_KEY")!, system, user)],
    [Deno.env.get("GEMINI_API_KEY"), () => callGemini(Deno.env.get("GEMINI_API_KEY")!, system, user)],
    [Deno.env.get("ANTHROPIC_API_KEY"), () => callAnthropic(Deno.env.get("ANTHROPIC_API_KEY")!, system, user)],
  ];
  for (const [k, fn] of chain) {
    if (!k) continue;
    try { return await fn(); } catch (e) { errs.push(String(e)); }
  }
  throw new Error(errs.join(" | ") || "Nenhum provedor configurado.");
}

function mimeFromB64(b64: string): string {
  if (b64.startsWith("/9j/")) return "image/jpeg";
  if (b64.startsWith("iVBOR")) return "image/png";
  return "image/jpeg";
}

async function geminiVision(key: string, b64: string, prompt: string): Promise<string> {
  const r = await fetchTimeout(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ inline_data: { mime_type: mimeFromB64(b64), data: b64 } }, { text: prompt }] }] }),
  });
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return j?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function openaiVision(key: string, b64: string, prompt: string): Promise<string> {
  const r = await fetchTimeout("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: `data:${mimeFromB64(b64)};base64,${b64}` } }] }],
    }),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return j?.choices?.[0]?.message?.content || "";
}

async function geminiVisionMany(key: string, images: string[], prompt: string): Promise<string> {
  const parts: Record<string, unknown>[] = images.slice(0, 3).map((b64) => ({ inline_data: { mime_type: mimeFromB64(b64), data: b64 } }));
  parts.push({ text: prompt });
  const r = await fetchTimeout(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { temperature: 0.4 } }),
  }, 60000);
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  setUsage("gemini", "gemini-flash-latest", j?.usageMetadata ? { prompt_tokens: j.usageMetadata.promptTokenCount, completion_tokens: j.usageMetadata.candidatesTokenCount } : null);
  return j?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function openaiVisionMany(key: string, images: string[], prompt: string): Promise<string> {
  const content: Record<string, unknown>[] = [{ type: "text", text: prompt }];
  for (const b64 of images.slice(0, 3)) content.push({ type: "image_url", image_url: { url: `data:${mimeFromB64(b64)};base64,${b64}` } });
  const r = await fetchTimeout("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o-mini", temperature: 0.4, messages: [{ role: "user", content }] }),
  }, 60000);
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  setUsage("openai", "gpt-4o-mini", j?.usage);
  return j?.choices?.[0]?.message?.content || "";
}

async function anthropicVisionMany(key: string, images: string[], prompt: string): Promise<string> {
  const content: Record<string, unknown>[] = images.slice(0, 3).map((b64) => ({
    type: "image",
    source: { type: "base64", media_type: mimeFromB64(b64), data: b64 },
  }));
  content.push({ type: "text", text: prompt });
  const r = await fetchTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-3-5-haiku-latest", max_tokens: 4096, messages: [{ role: "user", content }] }),
  }, 60000);
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return j?.content?.[0]?.text || "";
}

const PROPOSAL_SYSTEM = `Você é um consultor comercial sênior de uma agência/estúdio de tecnologia no Brasil. Sua tarefa é transformar a conversa de WhatsApp com um cliente em uma proposta comercial profissional, pronta para enviar.

Leia com atenção a conversa e os prints. Extraia apenas o que o cliente realmente pediu. Quando faltar informação, assuma o cenário mais comum e registre a suposição em "premissas" — nunca invente um pedido que não aparece.

As "Observações do vendedor" podem conter uma "AUDITORIA DO SITE DO CLIENTE" com melhorias recomendadas. Trate essas melhorias como ofertas do vendedor: inclua os ajustes no escopo e nos entregáveis, explicando o ganho esperado, sem apresentá-los como pedidos do cliente e sem inventar além do que foi listado.

O vendedor pode oferecer site, landing page, aplicativo, sistema sob medida ou combinação de site + app. Identifique o tipo mais adequado ao pedido.

Use português do Brasil, tom profissional e direto, sem markdown e sem emojis.

Faixas de referência do mercado brasileiro (ajuste para cima/baixo conforme complexidade, integrações, conteúdo e prazo):
- landing page: 1 a 3 semanas; R$ 1.500 a R$ 4.000
- site institucional: 2 a 6 semanas; R$ 2.500 a R$ 12.000
- e-commerce: 4 a 10 semanas; R$ 6.000 a R$ 25.000
- aplicativo MVP: 8 a 16 semanas; R$ 15.000 a R$ 50.000
- sistema sob medida: 10 a 20 semanas; R$ 20.000 a R$ 90.000
- site + app: 10 a 18 semanas; R$ 20.000 a R$ 70.000
Prazos e valores devem ser coerentes com o escopo. Se o cliente citou orçamento ou prazo, respeite e explique a diferença nas premissas.

Responda SOMENTE JSON válido, sem markdown, com exatamente este formato:
{
  "cliente": { "nome": "", "empresa": "", "contato": "", "segmento": "", "cidade": "" },
  "titulo": "Proposta de site institucional para ...",
  "tipo": "site" | "app" | "sistema" | "site_app",
  "resumo": "2 a 4 frases explicando o que será feito e o resultado esperado",
  "escopo": [ { "titulo": "Etapa", "descricao": "o que será feito", "itens": ["entregável concreto", "..."] } ],
  "entregaveis": ["..."],
  "prazo": { "semanas_min": 0, "semanas_max": 0, "texto": "6 a 8 semanas", "etapas": [ { "nome": "Descoberta", "duracao": "1 semana", "entregaveis": "..." } ] },
  "investimento": { "min": 0, "max": 0, "texto": "R$ 0 a R$ 0", "observacao": "condições", "validade_dias": 15, "forma_pagamento": "ex.: 40% na aprovação e 60% na entrega" },
  "premissas": ["..."],
  "nao_inclui": ["..."],
  "proximos_passos": ["..."],
  "mensagem_cliente": "mensagem curta e cordial para enviar no WhatsApp junto com o PDF"
}

Regras de qualidade:
- "escopo": 3 a 6 blocos, cada um com 2 a 5 itens concretos.
- "entregaveis": 5 a 10 itens.
- "premissas" e "nao_inclui": no mínimo 3 itens cada.
- "proximos_passos": 3 itens.
- "mensagem_cliente": no máximo 4 frases.
- Se a conversa não tiver o nome do cliente, deixe vazio; não invente.
`;

const EXTRACT_PROMPT = `Analise a foto (fachada, placa, cartão ou anúncio de um estabelecimento/comércio) e extraia SOMENTE o que está LEGÍVEL na imagem, para cadastro.
Regras:
- "nome": nome COMPLETO do negócio, exatamente como aparece (com o tipo/ramo). Nunca invente.
- "celular": telefone celular/WhatsApp (SÓ DÍGITOS, com DDD) se aparecer.
- "telefone": telefone fixo (SÓ DÍGITOS, com DDD) se aparecer.
- "rede_social": @perfil/instagram/facebook se aparecer.
- "site": site (www) se aparecer.
- "endereco", "bairro", "cidade", "estado", "cep": preencha APENAS o que estiver escrito e legível na imagem. Se não estiver visível, use "" (string vazia). NUNCA adivinhe nem deduza a cidade.
- "categoria": o ramo (ex.: "chaves e fechaduras").
- "tags": 3 a 6 termos em minúsculas.
Responda SOMENTE com JSON, sem markdown: nome, celular, telefone, rede_social, site, endereco, bairro, cidade, estado, cep, categoria, tags.`;

async function callGemini(key: string, system: string, user: string): Promise<string> {
  const r = await fetchTimeout(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { temperature: 0.7 },
    }),
  });
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  setUsage("gemini", "gemini-flash-latest", j?.usageMetadata ? { prompt_tokens: j.usageMetadata.promptTokenCount, completion_tokens: j.usageMetadata.candidatesTokenCount } : null);
  return j?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function callOpenAI(key: string, system: string, user: string): Promise<string> {
  const r = await fetchTimeout("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o-mini", temperature: 0.7, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  setUsage("openai", "gpt-4o-mini", j?.usage);
  return j?.choices?.[0]?.message?.content || "";
}

async function callDeepSeek(key: string, system: string, user: string): Promise<string> {
  const r = await fetchTimeout("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "deepseek-flash", temperature: 0.7, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
  });
  if (!r.ok) throw new Error(`DeepSeek ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  setUsage("deepseek", "deepseek-flash", j?.usage);
  return j?.choices?.[0]?.message?.content || "";
}

async function callAnthropic(key: string, system: string, user: string, maxTokens = 1024): Promise<string> {
  const r = await fetchTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-3-5-haiku-latest", max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  return j?.content?.[0]?.text || "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const uid = userData.user.id;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const body = (await req.json().catch(() => ({}))) as In;

    // Modo TESTE: valida o provedor/chave e devolve feedback.
    if (body.action === "test") {
      const provider = (body.provider || "default").toLowerCase();
      const byo = (body.api_key || "").trim();
      const sys = "Você é um teste. Responda apenas: ok";
      const usr = "Diga apenas: ok";
      try {
        let out = "";
        if (provider !== "default" && byo) {
          if (provider === "gemini") out = await callGemini(byo, sys, usr);
          else if (provider === "openai") out = await callOpenAI(byo, sys, usr);
          else if (provider === "anthropic") out = await callAnthropic(byo, sys, usr);
          else if (provider === "deepseek") out = await callDeepSeek(byo, sys, usr);
          else return new Response(JSON.stringify({ ok: false, error: "Provedor inválido." }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        } else {
          const chain: Array<[string | undefined, () => Promise<string>]> = [
            [Deno.env.get("GEMINI_API_KEY"), () => callGemini(Deno.env.get("GEMINI_API_KEY")!, sys, usr)],
            [Deno.env.get("OPENAI_API_KEY"), () => callOpenAI(Deno.env.get("OPENAI_API_KEY")!, sys, usr)],
            [Deno.env.get("ANTHROPIC_API_KEY"), () => callAnthropic(Deno.env.get("ANTHROPIC_API_KEY")!, sys, usr)],
            [Deno.env.get("DEEPSEEK_API_KEY"), () => callDeepSeek(Deno.env.get("DEEPSEEK_API_KEY")!, sys, usr)],
          ];
          const errs: string[] = [];
          for (const [k, fn] of chain) {
            if (!k) continue;
            try { out = await fn(); break; } catch (e) { errs.push(String(e)); }
          }
          if (!out) return new Response(JSON.stringify({ ok: false, error: errs.join(" | ") || "Nenhum provedor padrão configurado." }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        return new Response(JSON.stringify({ ok: true, provider, sample: (out || "").slice(0, 80) }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : "Falha" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Modo OGIMAGE: pega uma imagem leve de referência (logo/og:image do site, ou da página achada na web).
    if (body.action === "ogimage") {
      const site = (body.site || "").trim();
      const nome = (body.nome || "").trim();
      const cidade = (body.city || "").trim();
      const buscar = body.buscar !== false;
      const base = site ? (site.startsWith("http") ? site : `https://${site}`) : "";
      const abs = (u: string, b: string) => { try { return new URL(u, b).href; } catch { return ""; } };
      // Descarta ícones genéricos (Exa, favicon do Facebook, rsrc, etc.)
      const isGeneric = (u: string) => /exa\.ai|static\.xx\.fbcdn|\/rsrc\.php|favicon\.ico|\/icon\?|\/favicon|map_icon|placeholder|noimage|sem-?imagem|default\/assets|\/default\/|og[-_]?default|share[-_]?default/i.test(u);
      const grab = async (url: string, allowIcon: boolean): Promise<string> => {
        try {
          const r = await fetchTimeout(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; OutboundSales/1.0)" } }, 10000);
          if (!r.ok) return "";
          const html = (await r.text()).slice(0, 200000);
          const og =
            html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|og:image:url|twitter:image)["'][^>]+content=["']([^"']+)["']/i) ||
            html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/i);
          let img = og ? abs(og[1], url) : "";
          if (!img && allowIcon) {
            const ic = html.match(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']([^"']+)["']/i);
            if (ic) img = abs(ic[1], url);
          }
          return isGeneric(img) ? "" : img;
        } catch { return ""; }
      };
      let image = "";
      if (base) image = await grab(base, true);
      if (!image && buscar && nome) {
        const EXA = Deno.env.get("EXA_API_KEY");
        if (EXA) {
          try {
            const r = await fetchTimeout("https://api.exa.ai/search", {
              method: "POST",
              headers: { "x-api-key": EXA, "Content-Type": "application/json" },
              body: JSON.stringify({ query: [nome, cidade].filter(Boolean).join(" "), numResults: 6 }),
            }, 15000);
            if (r.ok) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const j: any = await r.json();
              const isDir = (u: string) => /exa\.ai|restaurantguru|tripadvisor|yelp|guiamais|apontador|solutudo|telelistas|guiafacil|cnpj|empresafone|telelistas|consultarse|mapa.?empresa|facebook\.com\/search/i.test(u);
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const urls: string[] = (j.results || []).map((x: any) => x.url).filter((u: string) => u && !isDir(u));
              for (const u of urls.slice(0, 5)) {
                image = await grab(u, false);
                if (image) break;
              }
            }
          } catch { /* ignora */ }
        }
      }
      image = image.replace(/&amp;/g, "&");
      return new Response(JSON.stringify({ image }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Modo RESUMO DE CURRÍCULO: destila os diferenciais do currículo para a IA usar nas abordagens.
    if (body.action === "resume") {
      const texto = String(body.text || "").slice(0, 20000);
      if (!texto.trim()) {
        return new Response(JSON.stringify({ summary: "" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const system = "Você lê o currículo de um prestador de serviços e extrai os diferenciais que ajudam a vender a pequenos negócios. Responda em português, sem markdown.";
      const user = `Currículo:\n${texto}\n\nExtraia os pontos MAIS RELEVANTES para prospectar negócios: (1) setores/segmentos onde a pessoa tem experiência, (2) competências-chave, (3) resultados ou números citados, (4) certificações/formações, (5) anos de experiência, (6) diferenciais competitivos. Escreva de 5 a 8 tópicos curtos e objetivos. Use SOMENTE o que está no currículo, não invente.`;
      try {
        const raw = await runChain(system, user);
        return new Response(JSON.stringify({ summary: (raw || "").trim() }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (e) {
        return new Response(JSON.stringify({ summary: "", error: e instanceof Error ? e.message : "Falha" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Modo DISCOVER: acha negócios de um setor dentro da região (Exa/Tavily).
    if (body.action === "discover") {
      const sector = (body.sector || "").trim();
      const region = body.region || "Florianópolis, São José, Palhoça, Biguaçu, Garopaba";
      const city = body.city || "";
      const radius = Number(body.radius) || 0;
      const limit = Math.min(20, Math.max(3, Number(body.limit) || 12));
      if (!sector) {
        return new Response(JSON.stringify({ error: "Informe o setor (ex.: oficinas mecânicas)." }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // 0) Fonte REAL (Google Maps): Places API (New) por raio — se tivermos chave + lat/lng.
      const GKEY = Deno.env.get("GOOGLE_PLACES_API_KEY") || Deno.env.get("GOOGLE_MAPS_API_KEY");
      const glat = Number(body.lat);
      const glng = Number(body.lng);
      if (GKEY && Number.isFinite(glat) && Number.isFinite(glng) && glat !== 0 && glng !== 0) {
        const gr = Math.min(50000, Math.max(1000, (radius || 10) * 1000));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const out: any[] = [];
        let pageToken = "";
        try {
          for (let page = 0; page < 3; page++) {
            const reqBody: Record<string, unknown> = {
              textQuery: sector,
              languageCode: "pt-BR",
              regionCode: "BR",
              maxResultCount: 20,
              locationRestriction: { circle: { center: { latitude: glat, longitude: glng }, radius: gr } },
            };
            if (pageToken) reqBody.pageToken = pageToken;
            const resp = await fetchTimeout("https://places.googleapis.com/v1/places:searchText", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": GKEY,
                "X-Goog-FieldMask":
                  "places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.location,nextPageToken",
              },
              body: JSON.stringify(reqBody),
            }, 25000);
            if (!resp.ok) {
              const t = await resp.text();
              return new Response(JSON.stringify({ error: `Google Places ${resp.status}: ${t.slice(0, 200)}` }), {
                status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const j: any = await resp.json();
            for (const p of (j.places || [])) {
              const plat = p.location?.latitude ?? null;
              const plng = p.location?.longitude ?? null;
              out.push({
                nome: p.displayName?.text || "",
                telefone: String(p.nationalPhoneNumber || "").replace(/\D/g, ""),
                site: p.websiteUri || "",
                endereco: p.formattedAddress || "",
                cidade: "",
                lat: plat,
                lng: plng,
                dist_km: plat != null && plng != null ? Number(haversineKm(glat, glng, plat, plng).toFixed(2)) : null,
              });
            }
            pageToken = j.nextPageToken || "";
            if (!pageToken) break;
          }
          if (out.length) {
            return new Response(JSON.stringify({ negocios: out, fonte: "google_places" }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        } catch { /* cai para OSM/web */ }
      }

      // 1) Fonte REAL gratuita: Photon (OpenStreetMap) por categoria + proximidade (funciona na edge).
      const lat = Number(body.lat);
      const lng = Number(body.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) {
        const radiusKm = radius || 10;

        // 0) Fonte COMPLETA gratuita: Overpass (OpenStreetMap) por raio — sem o teto de 50 do Photon.
        try {
          const filter = osmFilter(sector);
          const around = `around:${Math.round(radiusKm * 1000)},${lat},${lng}`;
          const oq = `[out:json][timeout:25];(node${filter}(${around});way${filter}(${around}););out center 400;`;
          const ENDPOINTS = [
            "https://overpass-api.de/api/interpreter",
            "https://overpass.kumi.systems/api/interpreter",
            "https://overpass.osm.ch/api/interpreter",
            "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
          ];
          let oRows: (Record<string, unknown> & { _d: number; lat: number; lng: number; nome: string })[] = [];
          for (const ep of ENDPOINTS) {
            try {
              const oresp = await fetchTimeout(ep, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "OutboundSales/1.0 (contato@zonn.com.br)" },
                body: "data=" + encodeURIComponent(oq),
              }, 22000);
              if (!oresp.ok) continue;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const oj: any = await oresp.json();
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              oRows = (oj.elements || []).map((e: any) => {
                const t = e.tags || {};
                const elat = e.lat ?? e.center?.lat ?? null;
                const elng = e.lon ?? e.center?.lon ?? null;
                const nome = t.name || t["name:pt"] || "";
                const endereco = [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(", ");
                return {
                  nome,
                  telefone: String(t.phone || t["contact:phone"] || "").replace(/\D/g, ""),
                  site: t.website || t["contact:website"] || "",
                  endereco,
                  cidade: t["addr:city"] || t["addr:suburb"] || "",
                  lat: elat,
                  lng: elng,
                };
              })
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .filter((x: any) => x.nome && x.lat != null && x.lng != null)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .map((x: any) => ({ ...x, _d: haversineKm(lat, lng, x.lat, x.lng) }))
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .filter((x: any) => x._d <= radiusKm)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .sort((a: any, b: any) => a._d - b._d);
              if (oRows.length) break;
            } catch { /* tenta o próximo espelho */ }
          }
          const seen = new Set<string>();
          const negocios: Record<string, unknown>[] = [];
          for (const x of oRows) {
            const key = `${x.nome}|${x.lat.toFixed(4)}|${x.lng.toFixed(4)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const { _d, ...rest } = x;
            negocios.push({ ...rest, dist_km: Number(_d.toFixed(2)) });
            if (negocios.length >= 100) break;
          }
          if (negocios.length) {
            return new Response(JSON.stringify({ negocios, fonte: "overpass", raio_km: radiusKm }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        } catch { /* cai para Photon */ }

        const tag = osmTag(sector);
        const url =
          `https://photon.komoot.io/api/?q=${encodeURIComponent(sector)}&limit=50&lat=${lat}&lon=${lng}` +
          (tag ? `&osm_tag=${encodeURIComponent(tag)}` : "");
        try {
          const resp = await fetchTimeout(url, { headers: { "User-Agent": "OutboundSales/1.0 (contato@zonn.com.br)" } }, 25000);
          if (resp.ok) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const j: any = await resp.json();
            const neg = (j.features || [])
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .map((f: any) => {
                const p = f.properties || {};
                const c = f.geometry?.coordinates || [];
                return {
                  nome: p.name || "",
                  telefone: String(p.phone || p["contact:phone"] || "").replace(/\D/g, ""),
                  site: p.website || p["contact:website"] || "",
                  endereco: [p.street, p.housenumber, p.city].filter(Boolean).join(", "),
                  cidade: p.city || "",
                  lat: c[1] ?? null,
                  lng: c[0] ?? null,
                };
              })
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .filter((x: any) => x.nome && x.lat != null)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .map((x: any) => ({ ...x, _d: haversineKm(lat, lng, x.lat, x.lng) }))
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .sort((a: any, b: any) => a._d - b._d);
            // Respeita ESTRITAMENTE o raio do Atendimento (nunca traz coisa longe).
            const within = neg.filter((x: { _d: number }) => x._d <= radiusKm);
            const negocios = within.map((x: { _d: number } & Record<string, unknown>) => {
              const { _d, ...rest } = x;
              return { ...rest, dist_km: Number(_d.toFixed(2)) };
            });
            return new Response(JSON.stringify({
              negocios,
              fonte: "photon",
              raio_km: radiusKm,
              aviso: negocios.length ? undefined : `Nenhum resultado de "${sector}" num raio de ${radiusKm} km. Aumente o raio em Atendimento ou tente outro setor.`,
            }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        } catch { /* cai para o fallback web */ }
      }

      const sources: { title: string; url: string; text: string }[] = [];
      const EXA = Deno.env.get("EXA_API_KEY");
      const TAV = Deno.env.get("TAVILY_API_KEY");
      const q = [sector, city || region, region, radius ? `região de ${radius} km` : ""].filter(Boolean).join(" em ");
      if (EXA) {
        try {
          const r = await fetchTimeout("https://api.exa.ai/search", {
            method: "POST",
            headers: { "x-api-key": EXA, "Content-Type": "application/json" },
            body: JSON.stringify({ query: q, numResults: limit * 2, contents: { text: { maxCharacters: 1200 } } }),
          }, 25000);
          if (r.ok) {
            const j = await r.json();
            for (const x of (j.results || [])) sources.push({ title: x.title || "", url: x.url || "", text: x.text || "" });
          }
        } catch { /* ignora */ }
      }
      if (TAV) {
        try {
          const r = await fetchTimeout("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ api_key: TAV, query: q, max_results: Math.min(10, limit + 3), include_raw_content: false }),
          }, 25000);
          if (r.ok) {
            const j = await r.json();
            for (const x of (j.results || [])) sources.push({ title: x.title || "", url: x.url || "", text: String(x.content || "").slice(0, 800) });
          }
        } catch { /* ignora */ }
      }
      if (!sources.length) {
        return new Response(JSON.stringify({ error: EXA || TAV ? "Nada encontrado nessa região." : "Pesquisa não configurada (sem chave Exa/Tavily)." }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const system = "Você extrai uma lista de NEGÓCIOS reais a partir de fontes públicas. Responda SOMENTE JSON, sem markdown.";
      const user = `Setor desejado: ${sector}\nRegião: ${region}\n\nFontes:\n${sources.map((s, i) => `[${i + 1}] ${s.title} ${s.url}\n${s.text}`).join("\n\n")}\n\nListe até ${limit} negócios DIFERENTES que ficam na região informada. Ignore diretórios/listas genéricas quando possível (prefira o site do próprio negócio). Se o telefone aparecer, inclua.\nResponda JSON: { "negocios": [ { "nome": "", "site": "", "telefone": "", "cidade": "" } ] }`;
      try {
        const raw = await runChain(system, user);
        const parsed = (parseJson(raw) || {}) as { negocios?: { nome?: string; site?: string; telefone?: string; cidade?: string }[] };
        const negocios = Array.isArray(parsed.negocios) ? parsed.negocios.slice(0, limit) : [];
        return new Response(JSON.stringify({ negocios, fontes: sources.map((s) => s.url) }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Falha na busca" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Modo ENRICH: pesquisa o prospect na web (Exa/Tavily) e resume o negócio.
    if (body.action === "enrich") {
      const nome = body.nome || "";
      const site = body.site || "";
      const cidade = body.city || "";
      const phone = String(body.phone || "").replace(/\D/g, "");
      // Região (cidades do "Atendimento"): a pesquisa é RESTRITA a elas.
      const region = (body.region || "").trim();
      const regionCities = region ? region.split(",").map((s) => s.trim()).filter(Boolean) : [];
      const sources: { title: string; url: string; text: string }[] = [];
      const EXA = Deno.env.get("EXA_API_KEY");
      const TAV = Deno.env.get("TAVILY_API_KEY");
      if (EXA) {
        try {
          const q = [nome, phone, region || cidade, "site oficial instagram facebook contato"].filter(Boolean).join(" ");
          const r = await fetchTimeout("https://api.exa.ai/search", {
            method: "POST",
            headers: { "x-api-key": EXA, "Content-Type": "application/json" },
            body: JSON.stringify({ query: q, numResults: 5, contents: { text: { maxCharacters: 2000 } } }),
          }, 25000);
          if (r.ok) {
            const j = await r.json();
            for (const x of (j.results || [])) sources.push({ title: x.title || "", url: x.url || "", text: x.text || "" });
          }
        } catch { /* ignora */ }
      }
      if (TAV) {
        try {
          const q = [nome, phone, region || cidade].filter(Boolean).join(" ");
          const r = await fetchTimeout("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ api_key: TAV, query: q, max_results: 4, include_raw_content: true }),
          }, 25000);
          if (r.ok) {
            const j = await r.json();
            for (const x of (j.results || [])) sources.push({ title: x.title || "", url: x.url || "", text: String(x.content || x.raw_content || "").slice(0, 1500) });
          }
        } catch { /* ignora */ }
      }
      if (!sources.length) {
        return new Response(
          JSON.stringify({ error: EXA || TAV ? "Nada encontrado na web para este prospect." : "Pesquisa na web não configurada (falta a chave da Exa)." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const system = "Você pesquisa um negócio específico em fontes públicas e extrai SOMENTE o que as fontes realmente dizem. NUNCA presuma a cidade nem invente dados. Responda SOMENTE JSON, sem markdown.";
      const user = `Prospect: ${nome}${phone ? ` — telefone: ${phone}` : ""}${site ? ` — site: ${site}` : ""}${cidade ? ` — endereço/cidade informados: ${cidade}` : " — cidade não informada"}\n\nFontes encontradas:\n${sources.map((s, i) => `[${i + 1}] ${s.title} ${s.url}\n${s.text}`).join("\n\n")}\n\nSua tarefa: identifique o negócio EXATO (pelo nome/telefone/site) e extraia o que as fontes realmente dizem.\n- REGIÃO PERMITIDA (cidades que o vendedor atende): ${region || "não informada"}. O negócio TEM que estar em UMA dessas cidades. Se o resultado for de outra cidade/estado (nome igual, empresa diferente), deixe "cidade" e "endereco" VAZIOS e diga no "resumo" que provavelmente é outra empresa (homônima).\n- CIDADE/estado: procure ATIVAMENTE nas fontes (endereço, diretórios como CNPJ/Yelp, Facebook), mas SOMENTE dentro da região permitida. Preencha "cidade" (ex.: "Palhoça/SC"); deixe "" se não estiver na região ou nenhuma fonte indicar.\n- "rede_social": a URL ou @ do perfil do negócio (Instagram/Facebook), se aparecer.\n- "site": o site oficial (com https://), se aparecer.\n- "telefone": telefone/WhatsApp com DDD (SÓ DÍGITOS, ex.: 51999999999), se aparecer.\n- "endereco": endereço completo (rua, número, bairro), se aparecer.\n- "resumo": o que o negócio faz e, se confirmado, ONDE fica.\n- "oportunidades": 2 a 4 formas concretas de ajudar esse negócio. Preencha SEMPRE ao menos 2.\nUse apenas o que as fontes afirmam. Nunca invente.\nResponda JSON: { "resumo": "...", "cidade": "cidade/UF ou ''", "rede_social": "url ou @ ou ''", "site": "url ou ''", "telefone": "só dígitos ou ''", "endereco": "...", "presenca_digital": "site/redes/nota", "oportunidades": ["...","..."] }`;
      try {
        const raw = await runChain(system, user);
        const parsed = (parseJson(raw) || {}) as {
          resumo?: string; cidade?: string; presenca_digital?: string; oportunidades?: string[];
          rede_social?: string; site?: string; telefone?: string; endereco?: string;
        };
        const resumo = parsed.resumo || raw;
        const cid = (parsed.cidade || "").trim();
        const presenca = (parsed.presenca_digital || "").trim();
        const oport = Array.isArray(parsed.oportunidades) ? parsed.oportunidades.map((o) => String(o).trim()).filter(Boolean) : [];
        const rede = (parsed.rede_social || "").trim();
        const siteWeb = (parsed.site || "").trim();
        const tel = String(parsed.telefone || "").replace(/\D/g, "");
        const end = (parsed.endereco || "").trim();
        // Trava de região: cidade/endereço só valem se estiverem nas cidades do "Atendimento".
        const cidLc = cid.toLowerCase();
        const inRegion = !regionCities.length || !cid || regionCities.some((c) => {
          const cl = c.toLowerCase();
          return cidLc.includes(cl) || cl.includes(cidLc);
        });
        const cidFinal = inRegion ? cid : "";
        const endFinal = inRegion ? end : "";
        const texto = [
          cidFinal ? `Cidade (fontes): ${cidFinal}` : "Cidade: não confirmada",
          `Resumo: ${resumo}`,
          presenca ? `Presença digital: ${presenca}` : "",
          oport.length ? `Oportunidades: ${oport.join("; ")}` : "",
        ].filter(Boolean).join("\n");
        await logUsage(admin, uid, "outbound", "lead_enrich");
        return new Response(
          JSON.stringify({ resumo, cidade: cidFinal, rede_social: rede, site: siteWeb, telefone: tel, endereco: endFinal, presenca_digital: presenca, oportunidades: oport, texto, fontes: sources.map((s) => s.url) }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      } catch (e) {
        return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Falha ao analisar" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Modo VISÃO: extrai os dados do estabelecimento a partir da foto.
    if (typeof body.image_base64 === "string" && body.image_base64) {
      const errs: string[] = [];
      let raw = "";
      const prov = (body.provider || "default").toLowerCase();
      const byo = (body.api_key || "").trim();
      const chain: Array<[string | undefined, () => Promise<string>]> =
        prov === "openai" && byo
          ? [[byo, () => openaiVision(byo, body.image_base64!, EXTRACT_PROMPT)]]
          : prov === "gemini" && byo
          ? [[byo, () => geminiVision(byo, body.image_base64!, EXTRACT_PROMPT)]]
          : [
              [Deno.env.get("GEMINI_API_KEY"), () => geminiVision(Deno.env.get("GEMINI_API_KEY")!, body.image_base64!, EXTRACT_PROMPT)],
              [Deno.env.get("OPENAI_API_KEY"), () => openaiVision(Deno.env.get("OPENAI_API_KEY")!, body.image_base64!, EXTRACT_PROMPT)],
            ];
      for (const [k, fn] of chain) {
        if (!k) continue;
        try { raw = await fn(); break; } catch (e) { errs.push(e instanceof Error ? e.message : String(e)); }
      }
      let extracted: Record<string, unknown> | null = null;
      try { extracted = parseJson(raw); } catch { extracted = null; }
      await logUsage(admin, uid, "outbound", "lead_vision");
      return new Response(
        JSON.stringify({ extracted, raw: extracted ? undefined : raw.slice(0, 400), error: extracted ? undefined : errs.join(" | ") || "Falha ao ler a foto" }),
        { status: extracted ? 200 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Modo ÁUDIO: transcreve (Whisper) e extrai os dados do estabelecimento.
    if (typeof body.audio_base64 === "string" && body.audio_base64) {
      const oKey = Deno.env.get("OPENAI_API_KEY");
      let transcript = "";
      if (oKey) {
        try {
          const bin = Uint8Array.from(atob(body.audio_base64), (c) => c.charCodeAt(0));
          const mime = body.audio_mime || "audio/webm";
          const ext = mime.includes("mp4") ? "mp4" : mime.includes("wav") ? "wav" : "webm";
          const fd = new FormData();
          fd.append("file", new Blob([bin], { type: mime }), `audio.${ext}`);
          fd.append("model", "whisper-1");
          fd.append("language", "pt");
          const r = await fetchTimeout("https://api.openai.com/v1/audio/transcriptions", {
            method: "POST",
            headers: { Authorization: `Bearer ${oKey}` },
            body: fd,
          });
          const j = await r.json().catch(() => ({}));
          transcript = (j?.text || "").trim();
        } catch {
          transcript = "";
        }
      }
      if (!transcript) {
        return new Response(JSON.stringify({ error: "Não consegui transcrever o áudio." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const prompt = `Um vendedor ditou os dados de um estabelecimento para cadastro.\nTexto ditado:\n"${transcript}"\n\nExtraia SOMENTE JSON: { "nome","celular","telefone","rede_social","site","endereco","bairro","cidade","estado","cep","categoria","tags":[] }`;
      let raw = "";
      const errs: string[] = [];
      const chain: Array<[string | undefined, () => Promise<string>]> = [
        [Deno.env.get("GEMINI_API_KEY"), () => callGemini(Deno.env.get("GEMINI_API_KEY")!, EXTRACT_PROMPT, prompt)],
        [Deno.env.get("OPENAI_API_KEY"), () => callOpenAI(Deno.env.get("OPENAI_API_KEY")!, EXTRACT_PROMPT, prompt)],
      ];
      for (const [k, fn] of chain) {
        if (!k) continue;
        try { raw = await fn(); break; } catch (e) { errs.push(String(e)); }
      }
      let extracted: Record<string, unknown> | null = null;
      try { extracted = parseJson(raw); } catch { extracted = null; }
      return new Response(
        JSON.stringify({ extracted, transcript, error: extracted ? undefined : errs.join(" | ") || "Falha ao extrair" }),
        { status: extracted ? 200 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Modo ENTREVISTA: conduz uma entrevista para entender o negócio do usuário.
    if (body.action === "interview") {
      const hist = Array.isArray(body.history) ? body.history : [];
      const historico = hist.map((h, i) => `P${i + 1}: ${h.q}\nR${i + 1}: ${h.a}`).join("\n\n") || "(ainda sem respostas)";
      const system = [
        "Você é um entrevistador comercial que ajuda um VENDEDOR a montar o perfil do negócio dele para prospecção.",
        "Contexto do produto: 'Outbound Sales' é um app de VENDAS POR PROSPECÇÃO ATIVA — abordagem de porta em porta e, principalmente, WhatsApp a WhatsApp (mensagem direta) como PRIMEIRA entrada para conquistar clientes.",
        "Seu objetivo: entender o que a pessoa vende/oferece, para quem, região, diferenciais e o que ela precisa para vender mais.",
        "LEIA TODO o CONTEXTO recebido (sobre_o_negocio, perfil_profissional, curriculo, site, redes, endereco_atendimento). Ele já contém MUITA informação.",
        "NÃO pergunte NADA que já esteja no contexto — nem serviços, nem preços, nem diferenciais, nem região, nem formas de pagamento, se já constarem. Se o currículo/perfil já descreve isso, está respondido.",
        "Pergunte SOMENTE o que estiver faltando de VERDADE e que seja útil para prospectar.",
        "Se já houver informação suficiente no contexto, marque \"pronto\": true e NÃO faça pergunta.",
        "A entrevista é CURTA: no MÁXIMO 3 perguntas no total.",
        "Responda SOMENTE JSON, sem markdown.",
      ].join("\n");
      const user = `Contexto conhecido do vendedor:\n${JSON.stringify(body.context || {})}\n\nHistórico da entrevista:\n${historico}\n\nCom base em tudo isso:\n1) Escreva um PERFIL consolidado (curto, 1 a 3 frases): o que vende, para quem, região, diferenciais.\n2) Faça a PRÓXIMA pergunta, curta e objetiva — ou deixe VAZIA se não precisa mais.\n3) Marque "pronto": true quando já tiver ${"\u2265"}3 respostas OU informação suficiente. Nunca passe de 3 perguntas.\nResponda JSON: { "perfil": "texto", "pergunta": "texto", "pronto": false }`;
      try {
        const raw = await runChain(system, user);
        let parsed: { perfil?: string; pergunta?: string; pronto?: boolean } | null = null;
        try { parsed = parseJson(raw) as any; } catch { parsed = null; }
        return new Response(JSON.stringify({
          perfil: parsed?.perfil || "",
          pergunta: parsed?.pergunta || raw,
          pronto: !!parsed?.pronto,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (e) {
        return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Falha na entrevista" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Modo PESQUISA: lê o site do usuário e monta o perfil profissional + perguntas.
    if (body.action === "research") {
      let siteText = "";
      if (body.site) {
        try {
          const u = /^https?:\/\//i.test(body.site) ? body.site : `https://${body.site}`;
          const ctrl = new AbortController();
          const to = setTimeout(() => ctrl.abort(), 8000);
          const r = await fetchTimeout(u, { headers: { "User-Agent": "OutboundSales/1.0 (contato@zonn.com.br)" }, signal: ctrl.signal });
          clearTimeout(to);
          const html = await r.text();
          siteText = stripHtml(html).slice(0, 4000);
        } catch { /* ignora */ }
      }
      const system = "Você ajuda a montar o perfil profissional de um vendedor, para personalizar prospecções. Responda SOMENTE JSON, sem markdown.";
      const user = `Nome: ${body.nome || "-"}\nEmpresa: ${body.company || "-"}\nSite: ${body.site || "-"}\nRedes: ${JSON.stringify(body.socials || {})}\nO que a pessoa disse de si: ${body.instrucao || "-"}\n\nConteúdo do site (pode estar vazio): ${siteText}\n\nMonte um PERFIL PROFISSIONAL (o que faz, para quem, diferenciais, tom de voz), liste servicos e faça de 3 a 6 PERGUNTAS para completar o que falta (serviços, preços, região, formas de pagamento...).\nResponda JSON: { "perfil": "texto", "servicos": ["..."], "perguntas": ["..."] }`;
      try {
        const raw = await runChain(system, user);
        let parsed: { perfil?: string; servicos?: string[]; perguntas?: string[] } | null = null;
        try { parsed = parseJson(raw) as any; } catch { parsed = null; }
        return new Response(JSON.stringify({
          perfil: parsed?.perfil || raw,
          servicos: parsed?.servicos || [],
          perguntas: parsed?.perguntas || [],
          siteRead: siteText.length,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (e) {
        return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Falha na pesquisa" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Modo PROPOSTA: lê a conversa (texto e/ou prints) e monta escopo, prazo e investimento.
    if (body.action === "proposal") {
      const conversation = String(body.conversation || "").slice(0, 24000).trim();
      const images = (Array.isArray(body.images) ? body.images : []).filter((x) => typeof x === "string" && x.length > 100).slice(0, 3);
      if (!conversation && !images.length) {
        return new Response(JSON.stringify({ error: "Cole a conversa do WhatsApp ou envie pelo menos um print." }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const brand = (body.brand || {}) as Record<string, unknown>;
      const projectType = String(body.project_type || "site");
      const notes = String(body.notes || "").slice(0, 2000);
      const brandLines = [
        `Empresa: ${brand.empresa || brand.nome || "não informada"}`,
        `Site: ${brand.site || "não informado"}`,
        `Redes: ${JSON.stringify(brand.socials || {})}`,
      ].join("\n");
      const user = `Tipo sugerido pelo vendedor: ${projectType}\n\nMarca do vendedor:\n${brandLines}\n\nObservações do vendedor:\n${notes || "(nenhuma)"}\n\nConversa do WhatsApp com o cliente:\n${conversation || "(a conversa está nos prints enviados)"}\n\n${images.length ? "Leia também os prints enviados e use o que estiver neles. " : ""}Monte a proposta completa no JSON pedido.`;
      const provider = String(body.provider || "default").toLowerCase();
      const byo = String(body.api_key || "").trim();
      let raw = "";
      const errs: string[] = [];
      if (images.length) {
        const chain: Array<[string | undefined, () => Promise<string>]> =
          provider === "gemini" && byo
            ? [[byo, () => geminiVisionMany(byo, images, `${PROPOSAL_SYSTEM}\n\n${user}`)]]
            : provider === "openai" && byo
            ? [[byo, () => openaiVisionMany(byo, images, `${PROPOSAL_SYSTEM}\n\n${user}`)]]
            : provider === "anthropic" && byo
            ? [[byo, () => anthropicVisionMany(byo, images, `${PROPOSAL_SYSTEM}\n\n${user}`)]]
            : [
                [Deno.env.get("GEMINI_API_KEY"), () => geminiVisionMany(Deno.env.get("GEMINI_API_KEY")!, images, `${PROPOSAL_SYSTEM}\n\n${user}`)],
                [Deno.env.get("OPENAI_API_KEY"), () => openaiVisionMany(Deno.env.get("OPENAI_API_KEY")!, images, `${PROPOSAL_SYSTEM}\n\n${user}`)],
                [Deno.env.get("ANTHROPIC_API_KEY"), () => anthropicVisionMany(Deno.env.get("ANTHROPIC_API_KEY")!, images, `${PROPOSAL_SYSTEM}\n\n${user}`)],
              ];
        for (const [k, fn] of chain) {
          if (!k) continue;
          try { raw = await fn(); break; } catch (e) { errs.push(e instanceof Error ? e.message : String(e)); }
        }
      } else if (provider !== "default" && byo) {
        try {
          if (provider === "gemini") raw = await callGemini(byo, PROPOSAL_SYSTEM, user);
          else if (provider === "openai") raw = await callOpenAI(byo, PROPOSAL_SYSTEM, user);
          else if (provider === "anthropic") raw = await callAnthropic(byo, PROPOSAL_SYSTEM, user, 4096);
          else if (provider === "deepseek") raw = await callDeepSeek(byo, PROPOSAL_SYSTEM, user);
          else throw new Error("Provedor inválido.");
        } catch (e) {
          errs.push(e instanceof Error ? e.message : String(e));
        }
      } else {
        try { raw = await runChain(PROPOSAL_SYSTEM, user); } catch (e) { errs.push(e instanceof Error ? e.message : String(e)); }
      }
      if (!raw) {
        return new Response(JSON.stringify({ error: errs.join(" | ") || "Nenhuma IA respondeu. Verifique a internet e tente de novo." }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const parsed = parseJson(raw);
      if (!parsed) {
        return new Response(JSON.stringify({ error: "A IA respondeu em um formato inesperado. Tente gerar de novo.", raw: raw.slice(0, 500) }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await logUsage(admin, uid, "outbound", "proposal_analyze");
      return new Response(JSON.stringify({ proposal: parsed, provider }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lead = body.lead || {};
    const instruction = (body.instruction || "").trim();
    const prof = (body.professional_profile || "").trim();
    const tags = Array.isArray(lead.tags) ? (lead.tags as string[]).join(", ") : String(lead.tags || "");
    const endereco = [lead.endereco, lead.bairro, lead.cidade, lead.estado].filter(Boolean).join(", ") || "não informado";
    // Cidade do PROSPECT: só a do lead ou a confirmada na "Pesquisa na web" (linha "Cidade (fontes): X").
    const wd = String(lead.web_research || "");
    const mCity = wd.match(/Cidade[^:]*:\s*([^\n]+)/i);
    const rawCity = mCity ? mCity[1].trim() : "";
    const webCity = /^n[ãa]o\s+confirmada/i.test(rawCity) ? "" : rawCity;
    // A cidade confirmada na WEB tem prioridade sobre a extraída da foto (que costuma chutar).
    const prospectCity = webCity || (lead.cidade && String(lead.cidade).trim()) || "";

    // Cidades de atuação do VENDEDOR — a IA tende a usá-las como se fossem do prospect.
    const sellerCities = String(body.seller_region || "")
      .split(",").map((s) => s.trim()).filter((s) => s.length >= 4);
    const someSellerCityAllowed = !!prospectCity && sellerCities.some((c) => prospectCity.toLowerCase().includes(c.toLowerCase()));

    const system = [
      STYLE,
      "",
      "# SOBRE QUEM ESTÁ OFERTANDO (o vendedor)",
      instruction || "(não informado)",
      prof ? `\n# PERFIL PROFISSIONAL DO VENDEDOR\n${prof}` : "",
      "",
      "# REGRAS DE FIDELIDADE (obrigatório)",
      "- O endereço/região do VENDEDOR é dele — NUNCA diga que o PROSPECT fica nesse lugar, salvo se conseguir identificar com certeza algo na imagem ou pegar latitude e longitude da foto quando tirada na hora.",
      "- Cidade permitida do prospect: SOMENTE o campo 'Cidade do prospect (CONFIRMADA)' abaixo, quando preenchido. Se for 'NÃO CONFIRMADA', não cite nenhuma cidade/bairro do prospect.",
      "- NUNCA deduza a cidade do prospect a partir da cidade/endereço do VENDEDOR. Uma cidade não tem a ver com a outra. Nova York não é Japão e vice-versa.",
      "- NUNCA invente serviços, dados ou localização do prospect nem do vendedor.",
      "",
      "Responda SOMENTE com JSON válido, sem markdown:",
      '{ "ramo": "curto", "tags": ["tag1","tag2"], "mensagem": "texto pronto", "sugestoes": ["serviço 1","serviço 2"] }',
    ].join("\n");

    const user = `DADOS DO PROSPECT:
- Nome/estabelecimento: ${lead.nome || "não informado"}
- Ramo/categoria: ${lead.categoria || "não informado"}
- Tags: ${tags || "não informado"}
- Rede social: ${lead.rede_social || "não informado"}
- Site: ${lead.site || "não informado"}
- Endereço: ${endereco}
- Observações: ${lead.observacoes || "não informado"}
- Cidade do prospect (CONFIRMADA — use SÓ esta, se preenchida): ${prospectCity || "NÃO CONFIRMADA"}
- Pesquisa na web sobre o prospect: ${lead.web_research || "não informado"}

Escreva a mensagem de prospecção personalizada.`;

    const provider = (body.provider || "default").toLowerCase();
    const byo = (body.api_key || "").trim();

    let text = "";
    if (provider !== "default" && byo) {
      if (provider === "gemini") text = await callGemini(byo, system, user);
      else if (provider === "openai") text = await callOpenAI(byo, system, user);
      else if (provider === "anthropic") text = await callAnthropic(byo, system, user);
      else if (provider === "deepseek") text = await callDeepSeek(byo, system, user);
      else {
        return new Response(JSON.stringify({ error: "Provedor inválido." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      const errs: string[] = [];
      const chain: Array<[string | undefined, () => Promise<string>]> = [
        [Deno.env.get("DEEPSEEK_API_KEY"), () => callDeepSeek(Deno.env.get("DEEPSEEK_API_KEY")!, system, user)],
        [Deno.env.get("OPENAI_API_KEY"), () => callOpenAI(Deno.env.get("OPENAI_API_KEY")!, system, user)],
        [Deno.env.get("GEMINI_API_KEY"), () => callGemini(Deno.env.get("GEMINI_API_KEY")!, system, user)],
        [Deno.env.get("ANTHROPIC_API_KEY"), () => callAnthropic(Deno.env.get("ANTHROPIC_API_KEY")!, system, user)],
      ];
      for (const [key, fn] of chain) {
        if (!key) continue;
        try { text = await fn(); break; } catch (e) { errs.push(e instanceof Error ? e.message : String(e)); }
      }
      if (!text) {
        const aviso = "Nenhuma IA respondeu. Troque o provedor nas configurações (Perfil) ou verifique seus tokens/chaves com seu provedor de IA.";
        return new Response(
          JSON.stringify({ error: aviso, detalhes: errs.join(" | ") }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    let parsed: { ramo?: string; tags?: string[]; mensagem?: string; sugestoes?: string[] } | null = null;
    try {
      parsed = parseJson(text) as any;
    } catch {
      parsed = null;
    }
    const outTags = Array.isArray(parsed?.tags) ? parsed!.tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 8) : [];
    let mensagemFinal = parsed?.mensagem || text;
    if (sellerCities.length && !someSellerCityAllowed) {
      mensagemFinal = scrubSellerCities(mensagemFinal, sellerCities, prospectCity);
    }
    await logUsage(admin, uid, "outbound", "lead_message");
    return new Response(
      JSON.stringify({ ramo: parsed?.ramo || null, tags: outTags, mensagem: mensagemFinal, sugestoes: parsed?.sugestoes || [] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
