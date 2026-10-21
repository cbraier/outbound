import { Capacitor } from "@capacitor/core";
import { supabase } from "@/lib/supabase";

export interface Dimension {
  id: string;
  label: string;
  weight: number;
  score: number;
  evidence: string[];
}

export interface BacklogItem {
  priority: string;
  action: string;
  why: string;
  impact: string;
  effort: string;
}

export interface Inferred {
  type?: string;
  category?: string;
  categoryConfidence?: number;
  model?: string;
  platforms?: string[];
}

export interface AuditResult {
  ok: boolean;
  url: string;
  total: number;
  scores: Dimension[];
  inferred: Inferred;
  backlog: BacklogItem[];
  signals?: Record<string, unknown>;
  markdown?: string;
}

export interface BenchmarkSite {
  url: string;
  total: number;
  scores?: Dimension[];
}

export interface BenchmarkResult {
  ok: boolean;
  own: BenchmarkSite;
  competitors: BenchmarkSite[];
  failures: { url: string; error: string }[];
  warning?: string;
  markdown?: string;
}

export function normalizeInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  return `https://${trimmed}`;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function apiBase(): string {
  if (!Capacitor.isNativePlatform()) return "";
  // O app iOS empacota o web build; a API continua no domínio de produção.
  return "https://outbound.dood.com.br";
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error("Entre com sua conta para auditar o site.");
  }

  const response = await fetch(`${apiBase()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let payload: { error?: string } = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { error: text.slice(0, 200) };
  }

  if (!response.ok) {
    throw new Error(
      payload.error || `Falha ao auditar o site (HTTP ${response.status}).`,
    );
  }

  return payload as T;
}

export function runAudit(url: string): Promise<AuditResult> {
  return post<AuditResult>("/api/commerce-pilot/audit", { url });
}

export function runBenchmark(
  url: string,
  competitors: string[],
): Promise<BenchmarkResult> {
  return post<BenchmarkResult>("/api/commerce-pilot/benchmark", {
    url,
    competitors,
  });
}

export function auditToProposalContext(audit: AuditResult): string {
  const weakest = [...audit.scores]
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((dim) => `${dim.label} (${dim.score.toFixed(1)}/10)`);

  const actions = audit.backlog
    .filter((item) => item.priority === "P0" || item.priority === "P1" || item.priority === "P2")
    .slice(0, 6)
    .map(
      (item) =>
        `[${item.priority}] ${item.action}${item.why ? ` — ${item.why}` : ""}`,
    );

  const parts = [
    "AUDITORIA DO SITE DO CLIENTE (inclua no escopo e nos entregáveis apenas os ajustes que fizerem sentido para o tipo de negócio; são melhorias recomendadas pelo vendedor, não pedidos que o cliente fez):",
    `Site: ${hostOf(audit.url)} · Nota ${audit.total.toFixed(1)}/100${audit.inferred?.type ? ` · ${audit.inferred.type}` : ""}`,
    weakest.length ? `Dimensões mais fracas: ${weakest.join("; ")}.` : "",
    actions.length ? `Ações prioritárias:\n${actions.join("\n")}` : "",
    "Não force aplicativo, lojas ou badge de app se a auditoria e a conversa não indicarem essa necessidade.",
  ].filter(Boolean);

  return parts.join("\n").slice(0, 1700);
}
