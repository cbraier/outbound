import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Globe2,
  Loader2,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import {
  hostOf,
  normalizeInput,
  runAudit,
  type AuditResult,
  type Dimension,
} from "@/lib/commercePilot";

function ScoreBar({ dim }: { dim: Dimension }) {
  const pct = Math.max(0, Math.min(100, (dim.score / 10) * 100));
  const tone =
    dim.score >= 7 ? "bg-emerald-500" : dim.score >= 4 ? "bg-amber-400" : "bg-rose-500";
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 truncate text-[11px] font-semibold text-brand-ink/70">
        {dim.label}
      </span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-brand-purple/10">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-7 shrink-0 text-right text-[10px] font-bold text-brand-deep">
        {dim.score.toFixed(1)}
      </span>
    </div>
  );
}

export default function CommerceAuditCard({
  url,
  onUrlChange,
  audit,
  onAudit,
  included,
  onIncludedChange,
  cost,
}: {
  url: string;
  onUrlChange: (value: string) => void;
  audit: AuditResult | null;
  onAudit: (value: AuditResult | null) => void;
  included: boolean;
  onIncludedChange: (value: boolean) => void;
  cost?: number;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [showAll, setShowAll] = useState(false);

  const auditar = async () => {
    const target = normalizeInput(url);
    if (!target) {
      setErr("Informe o site do cliente para auditar.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const result = await runAudit(target);
      onUrlChange(result.url);
      onAudit(result);
      onIncludedChange(true);
      setShowAll(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível auditar o site.");
    } finally {
      setBusy(false);
    }
  };

  const weakest = audit ? [...audit.scores].sort((a, b) => a.score - b.score) : [];
  const visibleDims = showAll ? weakest : weakest.slice(0, 3);
  const actions = audit
    ? [...audit.backlog]
        .sort((a, b) => {
          const rank = (p: string) => (p === "P0" ? 0 : p === "P1" ? 1 : 2);
          return rank(a.priority) - rank(b.priority);
        })
        .slice(0, 4)
    : [];

  return (
    <div className="card space-y-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="label">Auditoria do site do cliente</span>
          <p className="mt-1 text-[11px] leading-relaxed text-brand-ink/55">
            Analise o site atual e transforme os pontos fracos em argumentos e escopo para a proposta.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
          Grátis · 0 Doods
        </span>
      </div>

      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Globe2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-purple/50" />
          <input
            className="input !pl-9"
            value={url}
            onChange={(e) => {
              onUrlChange(e.target.value);
              if (audit) onAudit(null);
              if (err) setErr("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !busy) {
                e.preventDefault();
                void auditar();
              }
            }}
            placeholder="site-do-cliente.com.br"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={busy}
          />
        </div>
        <button
          className="btn-primary shrink-0 !px-3.5 !text-xs"
          onClick={() => void auditar()}
          disabled={busy || !url.trim()}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {busy ? "Analisando" : "Auditar"}
        </button>
      </div>

      <p className="text-[10px] text-brand-ink/40">
        A auditoria é heurística e não usa IA. A geração da proposta continua custando {cost ? `${cost} Doods` : "Doods"}.
      </p>

      {err && (
        <div className="flex gap-2 rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-600">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{err}</span>
        </div>
      )}

      {busy && (
        <div className="flex flex-col items-center gap-2 py-2">
          <div className="gemini-bar w-40" />
          <p className="gemini-text text-[11px] font-semibold">Lendo o site, performance e conversão...</p>
        </div>
      )}

      {audit && !busy && (
        <div className="space-y-3 rounded-2xl border border-brand-purple/15 bg-white/70 p-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" /> Auditoria pronta
              </div>
              <p className="truncate text-[11px] text-brand-ink/50">
                {hostOf(audit.url)}
                {audit.inferred?.type ? ` · ${audit.inferred.type}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-baseline gap-1">
              <span className="text-2xl font-black leading-none text-brand-deep">
                {Math.round(audit.total)}
              </span>
              <span className="text-[11px] font-bold text-brand-ink/40">/100</span>
            </div>
          </div>

          <div className="h-2 overflow-hidden rounded-full bg-brand-purple/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-pink via-brand-magenta to-brand-purple"
              style={{ width: `${Math.max(4, Math.min(100, audit.total))}%` }}
            />
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] font-bold text-brand-deep">
              {showAll ? "Todas as dimensões" : "Onde o site perde mais pontos"}
            </p>
            {visibleDims.map((dim) => (
              <ScoreBar key={dim.id} dim={dim} />
            ))}
            {weakest.length > 3 && (
              <button
                className="text-[10px] font-bold text-brand-purple underline-offset-2 hover:underline"
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll ? "Mostrar menos" : `Ver todas as ${weakest.length} dimensões`}
              </button>
            )}
          </div>

          {actions.length > 0 && (
            <div className="space-y-1.5">
              <p className="flex items-center gap-1 text-[11px] font-bold text-brand-deep">
                <Sparkles className="h-3.5 w-3.5 text-brand-purple" /> Ajustes para incluir na proposta
              </p>
              <ul className="space-y-1">
                {actions.map((item, i) => (
                  <li key={`${item.priority}-${i}`} className="flex gap-2 text-[11px] leading-snug text-brand-ink/70">
                    <span className="mt-0.5 shrink-0 rounded bg-brand-purple/10 px-1.5 py-0.5 text-[9px] font-black text-brand-deep">
                      {item.priority}
                    </span>
                    <span>
                      <strong className="font-bold text-brand-deep">{item.action}</strong>
                      {item.why ? ` — ${item.why}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <label className="flex cursor-pointer items-start gap-2 rounded-xl bg-brand-purple/5 p-2.5">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-brand-purple"
              checked={included}
              onChange={(e) => onIncludedChange(e.target.checked)}
            />
            <span className="text-[11px] font-semibold leading-snug text-brand-deep">
              Incluir estes ajustes no escopo da proposta
              <span className="block font-normal text-brand-ink/50">
                A IA recebe um resumo da auditoria e monta o escopo com as melhorias recomendadas.
              </span>
            </span>
          </label>

          <button
            className="flex items-center gap-1 text-[10px] font-semibold text-brand-ink/40 hover:text-red-500"
            onClick={() => onAudit(null)}
          >
            <X className="h-3 w-3" /> Remover auditoria
          </button>
        </div>
      )}
    </div>
  );
}
