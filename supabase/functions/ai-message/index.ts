import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
  socials?: Record<string, string>;
  instrucao?: string;
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
      try { extracted = JSON.parse(raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim()); } catch { extracted = null; }
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
      try { extracted = JSON.parse(raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim()); } catch { extracted = null; }
      return new Response(
        JSON.stringify({ extracted, transcript, error: extracted ? undefined : errs.join(" | ") || "Falha ao extrair" }),
        { status: extracted ? 200 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
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
        try { parsed = JSON.parse(raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim()); } catch { parsed = null; }
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
      parsed = JSON.parse(text.replace(/```json?\n?/g, "").replace(/```/g, "").trim());
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
