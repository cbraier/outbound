export type ProposalType = "site" | "app" | "sistema" | "site_app";

export interface ProposalScopeSection {
  titulo: string;
  descricao: string;
  itens: string[];
}

export interface ProposalTimelineStep {
  nome: string;
  duracao: string;
  entregaveis?: string;
}

export interface ProposalClient {
  nome: string;
  empresa: string;
  contato: string;
  segmento: string;
  cidade?: string;
}

export interface ProposalBrand {
  nome: string;
  empresa: string;
  site: string;
  socials: Record<string, string>;
  logo_url?: string;
  cor: string;
}

export interface GeneratedProposal {
  cliente: ProposalClient;
  titulo: string;
  tipo: ProposalType;
  resumo: string;
  escopo: ProposalScopeSection[];
  entregaveis: string[];
  prazo: {
    semanas_min: number;
    semanas_max: number;
    texto: string;
    etapas: ProposalTimelineStep[];
  };
  investimento: {
    min: number;
    max: number;
    texto: string;
    observacao: string;
    validade_dias: number;
    forma_pagamento: string;
  };
  premissas: string[];
  nao_inclui: string[];
  proximos_passos: string[];
  mensagem_cliente: string;
}

export interface SavedProposal extends GeneratedProposal {
  id: string;
  lead_id?: string;
  created_at: string;
  updated_at: string;
  status: "rascunho" | "pronta" | "enviada";
  conversa?: string;
  marca: ProposalBrand;
  pdf_url?: string;
}

export const PROPOSAL_TYPE_LABELS: Record<ProposalType, string> = {
  site: "Site / Landing page",
  app: "Aplicativo",
  sistema: "Sistema sob medida",
  site_app: "Site + aplicativo",
};

export const DEFAULT_BRAND_COLOR = "#A855F7";

export function emptyProposal(tipo: ProposalType = "site"): GeneratedProposal {
  return {
    cliente: { nome: "", empresa: "", contato: "", segmento: "", cidade: "" },
    titulo: "Proposta de projeto digital",
    tipo,
    resumo: "",
    escopo: [],
    entregaveis: [],
    prazo: { semanas_min: 0, semanas_max: 0, texto: "", etapas: [] },
    investimento: { min: 0, max: 0, texto: "", observacao: "", validade_dias: 15, forma_pagamento: "" },
    premissas: [],
    nao_inclui: [],
    proximos_passos: [],
    mensagem_cliente: "",
  };
}
