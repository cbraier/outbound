export const STAGES = ["lead", "prospect", "negociando", "fechado", "pos_vendas"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  lead: "Lead",
  prospect: "Prospect",
  negociando: "Negociando",
  fechado: "Fechado",
  pos_vendas: "Pós-Vendas",
};

export interface Lead {
  id: string;
  user_id: string;
  nome: string;
  telefone: string | null;
  rede_social: string | null;
  site: string | null;
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  categoria: string | null;
  tags: string[] | null;
  foto_url: string | null;
  lat: number | null;
  lng: number | null;
  mensagem: string | null;
  etapa: Stage;
  last_contact_at: string | null;
  followup_due_at: string | null;
  followup_sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  user_id: string;
  nome: string | null;
  email: string | null;
  ai_instruction: string | null;
  professional_profile: string | null;
  fixed_message: string | null;
  ai_provider: string | null;
  ai_api_key: string | null;
  site: string | null;
}
