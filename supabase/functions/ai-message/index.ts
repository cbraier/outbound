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
    [/pousada|hotel|hot[eé]l|hostel/, '["tourism"="hotel"]'],
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

const STYLE = `
Você ajuda um vendedor a escrever UMA mensagem de prospecção por WhatsApp para um comércio/empresa.
Escreva como uma pessoa de verdade: brasileiro, informal, próximo, de bairro — NUNCA com cara de IA, NUNCA corporativo, sem emoji em excesso, SEM travessão (—).
Regras:
- Comece com: "Olá, tudo bem? {saudacao}!" e uma linha em branco.
- Primeiro identifique o SEGMENTO pelo nome e dados do prospect.
- Depois ofereça, com naturalidade, de 1 a 3 serviços DO USUÁRIO (do perfil abaixo) que resolvem a dor daquele tipo de negócio. NÃO liste tudo.
- Cite o nome do estabelecimento de forma natural e fale da região.
- Termine convidando para um papo sem compromisso, com simpatia.
- 3 a 6 parágrafos curtos, texto corrido. Português do Brasil. Sem markdown.
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
  region?: string;
  radius?: number;
  sector?: string;
  limit?: number;
  lat?: number;
  lng?: number;
  socials?: Record<string, string>;
  instrucao?: string;
  history?: { q: string; a: string }[];
  context?: Record<string, unknown>;
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
    [Deno.env.get("GEMINI_API_KEY"), () => callGemini(Deno.env.get("GEMINI_API_KEY")!, system, user)],
    [Deno.env.get("OPENAI_API_KEY"), () => callOpenAI(Deno.env.get("OPENAI_API_KEY")!, system, user)],
    [Deno.env.get("ANTHROPIC_API_KEY"), () => callAnthropic(Deno.env.get("ANTHROPIC_API_KEY")!, system, user)],
    [Deno.env.get("DEEPSEEK_API_KEY"), () => callDeepSeek(Deno.env.get("DEEPSEEK_API_KEY")!, system, user)],
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

const EXTRACT_PROMPT = `Analise a foto (fachada, placa, cartão ou anúncio de um estabelecimento/comércio) e extraia os dados para cadastro.
Regras: "nome" deve ser o nome COMPLETO do negócio (com o tipo/ramo), nunca só o nome de uma pessoa. Se houver telefone, coloque em "celular" (somente dígitos, com DDD). Capture "rede_social" (@perfil/instagram/facebook), "site" (www), endereço, bairro, cidade, estado, cep, "categoria" (ramo) e "tags" (3-6 em minúsculas).
Responda SOMENTE com JSON, sem markdown, com as chaves: nome, celular, telefone, rede_social, site, endereco, bairro, cidade, estado, cep, categoria, tags.`;

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
  return j?.choices?.[0]?.message?.content || "";
}

async function callDeepSeek(key: string, system: string, user: string): Promise<string> {
  const r = await fetchTimeout("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "deepseek-chat", temperature: 0.7, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
  });
  if (!r.ok) throw new Error(`DeepSeek ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return j?.choices?.[0]?.message?.content || "";
}

async function callAnthropic(key: string, system: string, user: string): Promise<string> {
  const r = await fetchTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-3-5-haiku-latest", max_tokens: 1024, system, messages: [{ role: "user", content: user }] }),
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
              out.push({
                nome: p.displayName?.text || "",
                telefone: String(p.nationalPhoneNumber || "").replace(/\D/g, ""),
                site: p.websiteUri || "",
                endereco: p.formattedAddress || "",
                cidade: "",
                lat: p.location?.latitude ?? null,
                lng: p.location?.longitude ?? null,
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
            let within = neg.filter((x: { _d: number }) => x._d <= radiusKm);
            if (within.length < 6) within = neg.slice(0, 15);
            const negocios = within.map(({ _d, ...rest }: { _d: number }) => rest);
            if (negocios.length) {
              return new Response(JSON.stringify({ negocios, fonte: "photon" }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
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
      const region = body.region || "Florianópolis, São José, Palhoça, Biguaçu, Garopaba";
      const sources: { title: string; url: string; text: string }[] = [];
      const EXA = Deno.env.get("EXA_API_KEY");
      const TAV = Deno.env.get("TAVILY_API_KEY");
      if (EXA) {
        try {
          const q = [nome, cidade || region, region, "site oficial instagram facebook contato"].filter(Boolean).join(" ");
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
          const q = [nome, cidade || region, region].filter(Boolean).join(" ");
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
      const system = `Você analisa um prospect a partir de fontes públicas da web e ajuda um vendedor a ofertar serviços de prospecção/tecnologia.\nIMPORTANTE: considere SOMENTE negócios/fontes da região: ${region}. Desconsidere o que for de outras cidades; se não houver nada da região, diga isso. Responda SOMENTE JSON, sem markdown.`;
      const user = `Prospect: ${nome}${site ? ` — site: ${site}` : ""}${cidade ? ` — ${cidade}` : ""}\n\nFontes encontradas:\n${sources.map((s, i) => `[${i + 1}] ${s.title} ${s.url}\n${s.text}`).join("\n\n")}\n\nResponda JSON: { "resumo": "o que o negócio é e faz", "presenca_digital": "site/redes/nota", "oportunidades": ["...","..."] }`;
      try {
        const raw = await runChain(system, user);
        const parsed = (parseJson(raw) || {}) as { resumo?: string; presenca_digital?: string; oportunidades?: string[] };
        const resumo = parsed.resumo || raw;
        const presenca = parsed.presenca_digital || "";
        const oport = Array.isArray(parsed.oportunidades) ? parsed.oportunidades : [];
        const texto = `Resumo: ${resumo}\nPresença digital: ${presenca}\nOportunidades: ${oport.join("; ")}`;
        return new Response(
          JSON.stringify({ resumo, presenca_digital: presenca, oportunidades: oport, texto, fontes: sources.map((s) => s.url) }),
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

    const lead = body.lead || {};
    const instruction = (body.instruction || "").trim();
    const prof = (body.professional_profile || "").trim();
    const tags = Array.isArray(lead.tags) ? (lead.tags as string[]).join(", ") : String(lead.tags || "");
    const endereco = [lead.endereco, lead.bairro, lead.cidade, lead.estado].filter(Boolean).join(", ") || "não informado";

    const system = [
      STYLE,
      "",
      "# SOBRE QUEM ESTÁ OFERTANDO (o usuário)",
      instruction || "(não informado)",
      prof ? `\n# PERFIL PROFISSIONAL\n${prof}` : "",
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
        [Deno.env.get("GEMINI_API_KEY"), () => callGemini(Deno.env.get("GEMINI_API_KEY")!, system, user)],
        [Deno.env.get("OPENAI_API_KEY"), () => callOpenAI(Deno.env.get("OPENAI_API_KEY")!, system, user)],
        [Deno.env.get("ANTHROPIC_API_KEY"), () => callAnthropic(Deno.env.get("ANTHROPIC_API_KEY")!, system, user)],
        [Deno.env.get("DEEPSEEK_API_KEY"), () => callDeepSeek(Deno.env.get("DEEPSEEK_API_KEY")!, system, user)],
      ];
      for (const [key, fn] of chain) {
        if (!key) continue;
        try { text = await fn(); break; } catch (e) { errs.push(e instanceof Error ? e.message : String(e)); }
      }
      if (!text && errs.length === 0) {
        return new Response(
          JSON.stringify({ error: "Nenhuma IA configurada. Escolha um provedor ou informe sua chave no Perfil." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (!text) throw new Error(errs.join(" | "));
    }

    let parsed: { ramo?: string; tags?: string[]; mensagem?: string; sugestoes?: string[] } | null = null;
    try {
      parsed = parseJson(text) as any;
    } catch {
      parsed = null;
    }
    const outTags = Array.isArray(parsed?.tags) ? parsed!.tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 8) : [];
    return new Response(
      JSON.stringify({ ramo: parsed?.ramo || null, tags: outTags, mensagem: parsed?.mensagem || text, sugestoes: parsed?.sugestoes || [] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
