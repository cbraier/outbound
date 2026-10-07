import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
}

async function callGemini(key: string, system: string, user: string): Promise<string> {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
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
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o-mini", temperature: 0.7, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  return j?.choices?.[0]?.message?.content || "";
}

async function callAnthropic(key: string, system: string, user: string): Promise<string> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
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

    const useGemini = byo && provider === "gemini" ? byo : (provider === "gemini" ? Deno.env.get("GEMINI_API_KEY") : undefined);
    const useOpenAI = byo && provider === "openai" ? byo : (provider === "openai" ? Deno.env.get("OPENAI_API_KEY") : undefined);
    const useClaude = byo && provider === "anthropic" ? byo : (provider === "anthropic" ? Deno.env.get("ANTHROPIC_API_KEY") : undefined);

    if (useGemini || (provider === "default" && Deno.env.get("GEMINI_API_KEY"))) {
      text = await callGemini(useGemini || Deno.env.get("GEMINI_API_KEY")!, system, user);
    } else if (useOpenAI || (provider === "default" && Deno.env.get("OPENAI_API_KEY"))) {
      text = await callOpenAI(useOpenAI || Deno.env.get("OPENAI_API_KEY")!, system, user);
    } else if (useClaude || (provider === "default" && Deno.env.get("ANTHROPIC_API_KEY"))) {
      text = await callClaude(useClaude || Deno.env.get("ANTHROPIC_API_KEY")!, system, user);
    } else {
      return new Response(JSON.stringify({ error: "Nenhuma IA configurada. Escolha um provedor ou informe sua chave no Perfil." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
