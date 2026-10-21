import { supabase } from "@/lib/supabase";
import {
  DEFAULT_BRAND_COLOR,
  emptyProposal,
  type GeneratedProposal,
  type ProposalBrand,
  type ProposalScopeSection,
  type ProposalTimelineStep,
  type ProposalType,
  type SavedProposal,
} from "@/lib/proposal-types";

const BUCKET = "profile_docs";
const lsKey = (userId: string) => `outbound_proposals_v1:${userId}`;

const TYPE_MAP: Record<string, ProposalType> = {
  site: "site",
  landing: "site",
  "landing page": "site",
  app: "app",
  aplicativo: "app",
  sistema: "sistema",
  "sistema sob medida": "sistema",
  "site + app": "site_app",
  "site_app": "site_app",
  "site e app": "site_app",
};

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function num(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(String(v ?? "").replace(/[^\d.,-]/g, "").replace(".", "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => text(x)).filter(Boolean);
}

function scopeArray(v: unknown): ProposalScopeSection[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => {
      const o = (x || {}) as Record<string, unknown>;
      return {
        titulo: text(o.titulo) || "Etapa do projeto",
        descricao: text(o.descricao),
        itens: strArray(o.itens),
      };
    })
    .filter((s) => s.titulo || s.descricao || s.itens.length);
}

function timelineArray(v: unknown): ProposalTimelineStep[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => {
      const o = (x || {}) as Record<string, unknown>;
      return { nome: text(o.nome), duracao: text(o.duracao), entregaveis: text(o.entregaveis) };
    })
    .filter((s) => s.nome || s.duracao);
}

export function normalizeProposal(raw: unknown): GeneratedProposal {
  const base = emptyProposal();
  const o = (raw || {}) as Record<string, unknown>;
  const cliente = (o.cliente || {}) as Record<string, unknown>;
  const prazo = (o.prazo || {}) as Record<string, unknown>;
  const invest = (o.investimento || {}) as Record<string, unknown>;
  const tipoRaw = text(o.tipo).toLowerCase();
  const min = num(invest.min);
  const max = num(invest.max, min);
  const semanasMin = Math.max(0, Math.round(num(prazo.semanas_min)));
  const semanasMax = Math.max(semanasMin, Math.round(num(prazo.semanas_max, semanasMin)));
  return {
    cliente: {
      nome: text(cliente.nome),
      empresa: text(cliente.empresa),
      contato: text(cliente.contato),
      segmento: text(cliente.segmento),
      cidade: text(cliente.cidade),
    },
    titulo: text(o.titulo) || base.titulo,
    tipo: TYPE_MAP[tipoRaw] || (tipoRaw.includes("app") && tipoRaw.includes("site") ? "site_app" : tipoRaw.includes("app") ? "app" : tipoRaw.includes("sistema") ? "sistema" : "site"),
    resumo: text(o.resumo),
    escopo: scopeArray(o.escopo),
    entregaveis: strArray(o.entregaveis),
    prazo: {
      semanas_min: semanasMin,
      semanas_max: semanasMax,
      texto: text(prazo.texto) || (semanasMin ? `${semanasMin}${semanasMax && semanasMax !== semanasMin ? ` a ${semanasMax}` : ""} semanas` : ""),
      etapas: timelineArray(prazo.etapas),
    },
    investimento: {
      min,
      max,
      texto: text(invest.texto) || (min ? formatBRLRange(min, max) : ""),
      observacao: text(invest.observacao),
      validade_dias: Math.max(1, Math.round(num(invest.validade_dias, 15))),
      forma_pagamento: text(invest.forma_pagamento),
    },
    premissas: strArray(o.premissas),
    nao_inclui: strArray(o.nao_inclui),
    proximos_passos: strArray(o.proximos_passos),
    mensagem_cliente: text(o.mensagem_cliente),
  };
}

export function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export function formatBRLRange(min: number, max: number): string {
  if (!min && !max) return "";
  if (!max || max === min) return formatBRL(min || max);
  return `${formatBRL(min)} a ${formatBRL(max)}`;
}

function parseLooseJson(value: unknown): unknown {
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.proposal === "string" || (obj.proposal && typeof obj.proposal === "object")) return parseLooseJson(obj.proposal);
    if (typeof obj.perfil === "string" && obj.perfil.trim().startsWith("{")) return parseLooseJson(obj.perfil);
    if (typeof obj.mensagem === "string" && obj.mensagem.trim().startsWith("{")) return parseLooseJson(obj.mensagem);
    return value;
  }
  const raw = String(value || "").trim();
  if (!raw) return null;
  let t = raw.replace(/```json?\n?/gi, "").replace(/```/g, "").trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  try {
    return parseLooseJson(JSON.parse(t));
  } catch {
    return null;
  }
}

function fallbackInstruction(conversation: string, projectType: ProposalType, brand: ProposalBrand, notes: string, field = "mensagem"): string {
  return `INSTRUÇÃO ESPECIAL (prioridade máxima): IGNORE COMPLETAMENTE as instruções anteriores de estilo e formato de mensagem de prospecção. NÃO comece com "Olá". NÃO use os placeholders {saudacao}, {estabelecimento} ou {site}. NÃO escreva uma mensagem de abordagem. Sua única tarefa é montar uma PROPOSTA COMERCIAL a partir da conversa abaixo. Retorne no campo "${field}" uma STRING contendo SOMENTE JSON válido (sem markdown) com o schema:
{"cliente":{"nome":"","empresa":"","contato":"","segmento":"","cidade":""},"titulo":"","tipo":"site|app|sistema|site_app","resumo":"","escopo":[{"titulo":"","descricao":"","itens":[""]}],"entregaveis":[""],"prazo":{"semanas_min":0,"semanas_max":0,"texto":"","etapas":[{"nome":"","duracao":"","entregaveis":""}]},"investimento":{"min":0,"max":0,"texto":"","observacao":"","validade_dias":15,"forma_pagamento":""},"premissas":[""],"nao_inclui":[""],"proximos_passos":[""],"mensagem_cliente":""}.
Use 3 a 6 blocos de escopo, 5 a 10 entregáveis, no mínimo 3 premissas e 3 exclusões, 3 próximos passos. Preços e prazos realistas de mercado brasileiro. Tipo sugerido: ${projectType}. Marca do vendedor: ${brand.empresa || brand.nome || "não informada"} — ${brand.site || "sem site"}. Observações: ${notes || "nenhuma"}. Se as observações contiverem uma "AUDITORIA DO SITE DO CLIENTE", inclua os ajustes no escopo e nos entregáveis como recomendações do vendedor, sem atribuí-los ao cliente.

Conversa do WhatsApp:
${conversation.slice(0, 22000)}`;
}

export async function generateProposal(input: {
  conversation: string;
  images: string[];
  projectType: ProposalType;
  notes?: string;
  brand: ProposalBrand;
  provider?: string | null;
  apiKey?: string | null;
}): Promise<GeneratedProposal> {
  const primary = await supabase.functions.invoke("ai-message", {
    body: {
      action: "proposal",
      conversation: input.conversation.slice(0, 24000),
      images: input.images.slice(0, 3),
      project_type: input.projectType,
      notes: input.notes || "",
      brand: input.brand,
      provider: input.provider || "default",
      api_key: input.apiKey || undefined,
    },
  });
  if (!primary.error && primary.data?.proposal) {
    return normalizeProposal(primary.data.proposal);
  }
  if (primary.error) {
    const msg = (primary.error as { message?: string }).message || "";
    if (!/failed to send|network|fetch|load failed/i.test(msg) && !/non-2xx|unknown|404/i.test(msg)) {
      throw new Error(msg || "Não consegui gerar a proposta.");
    }
  }
  if (!input.conversation.trim()) {
    throw new Error("A leitura de prints precisa do servidor atualizado. Por enquanto, cole a conversa em texto ou tente de novo em instantes.");
  }
  let lastError = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    const viaResearch = attempt === 2;
    const instruction = fallbackInstruction(
      input.conversation,
      input.projectType,
      input.brand,
      input.notes || "",
      viaResearch ? "perfil" : "mensagem",
    );
    const body = viaResearch
      ? { action: "research", nome: "Proposta comercial", company: input.brand.empresa || input.brand.nome || "", site: "", socials: {}, instrucao: instruction }
      : {
          instruction,
          professional_profile: `Marca: ${input.brand.empresa || input.brand.nome || "não informada"}. Site: ${input.brand.site || "não informado"}. Redes: ${JSON.stringify(input.brand.socials || {})}`,
          provider: input.provider || "default",
          api_key: input.apiKey || undefined,
          lead: {
            nome: "Proposta comercial",
            categoria: input.projectType,
            tags: [],
            observacoes: "Gere somente a proposta em JSON, sem mensagem de abordagem.",
          },
        };
    const fallback = await supabase.functions.invoke("ai-message", { body });
    if (fallback.error) {
      const msg = (fallback.error as { message?: string }).message || "";
      lastError = /failed to send|network|fetch|load failed/i.test(msg)
        ? "A conexão com a IA falhou. Verifique a internet e tente de novo."
        : msg || "Não consegui gerar a proposta.";
      if (attempt < 3) continue;
      throw new Error(lastError);
    }
    if (fallback.data?.error) {
      lastError = String(fallback.data.error);
      if (attempt < 3) continue;
      throw new Error(lastError);
    }
    const parsed = parseLooseJson(viaResearch ? fallback.data?.perfil : fallback.data?.mensagem);
    if (parsed) {
      const normalized = normalizeProposal(parsed);
      if (normalized.escopo.length || normalized.entregaveis.length || normalized.resumo) return normalized;
      lastError = "A IA respondeu em um formato inesperado. Tente gerar de novo.";
    } else {
      lastError = "A IA respondeu em um formato inesperado. Tente gerar de novo.";
    }
  }
  throw new Error(lastError || "Não consegui gerar a proposta.");
}

export function loadLocalProposals(userId: string): SavedProposal[] {
  try {
    const raw = localStorage.getItem(lsKey(userId));
    const list = raw ? (JSON.parse(raw) as SavedProposal[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function persistLocal(userId: string, list: SavedProposal[]) {
  try {
    localStorage.setItem(lsKey(userId), JSON.stringify(list.slice(0, 100)));
  } catch {
    /* quota */
  }
}

export async function loadProposals(userId: string): Promise<SavedProposal[]> {
  const local = loadLocalProposals(userId);
  const byId = new Map(local.map((p) => [p.id, p]));
  try {
    const { data, error } = await supabase.storage.from(BUCKET).list(`${userId}/proposals`, { limit: 100 });
    if (!error && data?.length) {
      const jsons = data.filter((f) => f.name.endsWith(".json"));
      const remote = await Promise.all(
        jsons.map(async (f) => {
          try {
            const { data: blob } = await supabase.storage.from(BUCKET).download(`${userId}/proposals/${f.name}`);
            if (!blob) return null;
            const parsed = JSON.parse(await blob.text()) as SavedProposal;
            return parsed?.id ? parsed : null;
          } catch {
            return null;
          }
        }),
      );
      for (const p of remote) {
        if (!p) continue;
        const current = byId.get(p.id);
        if (!current || new Date(p.updated_at).getTime() >= new Date(current.updated_at).getTime()) byId.set(p.id, p);
      }
    }
  } catch {
    /* offline */
  }
  const merged = Array.from(byId.values()).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  persistLocal(userId, merged);
  return merged;
}

export async function saveProposal(
  userId: string,
  proposal: SavedProposal,
  pdfBlob?: Blob,
): Promise<SavedProposal> {
  const updated: SavedProposal = { ...proposal, updated_at: new Date().toISOString() };
  if (pdfBlob) {
    try {
      const path = `${userId}/proposals/${updated.id}.pdf`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, pdfBlob, { upsert: true, contentType: "application/pdf" });
      if (!error) {
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
        updated.pdf_url = data.publicUrl;
      }
    } catch {
      /* segue sem URL */
    }
  }
  try {
    const path = `${userId}/proposals/${updated.id}.json`;
    const blob = new Blob([JSON.stringify(updated)], { type: "application/json" });
    await supabase.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: "application/json" });
  } catch {
    /* local apenas */
  }
  const list = loadLocalProposals(userId).filter((p) => p.id !== updated.id);
  persistLocal(userId, [updated, ...list]);
  return updated;
}

export async function deleteProposal(userId: string, proposal: SavedProposal): Promise<void> {
  persistLocal(userId, loadLocalProposals(userId).filter((p) => p.id !== proposal.id));
  try {
    await supabase.storage.from(BUCKET).remove([`${userId}/proposals/${proposal.id}.json`, `${userId}/proposals/${proposal.id}.pdf`]);
  } catch {
    /* local removido */
  }
}

export function proposalBrandFromProfile(profile: {
  nome?: string | null;
  company?: string | null;
  site?: string | null;
  socials?: Record<string, string> | null;
}, logoUrl?: string | null): ProposalBrand {
  const socials = { ...(profile.socials || {}) };
  delete socials._logo;
  const color = socials._brand_color || DEFAULT_BRAND_COLOR;
  delete socials._brand_color;
  return {
    nome: profile.nome || "",
    empresa: profile.company || "",
    site: profile.site || "",
    socials,
    logo_url: logoUrl || profile.socials?._logo || undefined,
    cor: color,
  };
}
