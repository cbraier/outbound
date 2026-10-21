import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { type Lead, STAGES, STAGE_LABELS } from "@/lib/types";
import LeadDrawer from "@/components/LeadDrawer";
import { MapPin, ArrowRightLeft, Trash2 } from "lucide-react";

const STAGE_COLOR: Record<string, string> = {
  lead: "from-brand-sky/30 to-brand-sky/10",
  prospect: "from-brand-purple/30 to-brand-purple/10",
  negociando: "from-brand-gold/30 to-brand-gold/10",
  fechado: "from-brand-money/30 to-brand-money/10",
  pos_vendas: "from-brand-pink/30 to-brand-pink/10",
};

export default function Board({
  leads,
  profile,
  onRefresh,
  onGoToAgenda,
  onGoToDoods,
}: {
  leads: Lead[];
  profile: Parameters<typeof LeadDrawer>[0]["profile"] | null;
  onRefresh: () => void;
  onGoToAgenda?: (d?: Date) => void;
  onGoToDoods?: () => void;
}) {
  const [open, setOpen] = useState<Lead | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [moveLead, setMoveLead] = useState<Lead | null>(null);
  const [q, setQ] = useState("");

  const ql = q.trim().toLowerCase();
  const filtered = leads.filter((l) => {
    if (!ql) return true;
    const byName = (l.nome || "").toLowerCase().includes(ql);
    const byTag = (l.tags || []).some((t) => t.toLowerCase().includes(ql));
    return byName || byTag;
  });

  const soltarEm = async (st: (typeof STAGES)[number]) => {
    if (!dragId) return;
    const id = dragId;
    setDragId(null);
    await supabase.from("leads").update({ etapa: st } as never).eq("id", id);
    onRefresh();
  };

  const moverPara = async (st: (typeof STAGES)[number]) => {
    if (!moveLead) return;
    const id = moveLead.id;
    setMoveLead(null);
    await supabase.from("leads").update({ etapa: st } as never).eq("id", id);
    onRefresh();
  };

  const excluir = async (l: Lead) => {
    if (!confirm(`Excluir “${l.nome || "Sem nome"}”? Não dá pra desfazer.`)) return;
    const { error } = await supabase.from("leads").delete().eq("id", l.id);
    if (error) {
      alert("Erro ao excluir: " + error.message);
      return;
    }
    onRefresh();
  };
  const followups = filtered.filter(
    (l) => l.etapa === "prospect" && l.followup_due_at && new Date(l.followup_due_at) <= new Date() && !l.followup_sent_at,
  );

  return (
    <>
      <div className="mb-3 space-y-2">
        <div className="relative">
          <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-ink/30" />
          <input
            className="input !pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome..."
          />
        </div>
      </div>

      {followups.length > 0 && (
        <div className="mb-3 rounded-2xl border border-brand-gold/40 bg-brand-gold/10 p-3">
          <p className="text-xs font-bold text-brand-deep">
            Follow-ups de hoje ({followups.length}) — envie a mensagem “Pesquisa”
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {followups.map((f) => (
              <button
                key={f.id}
                onClick={() => setOpen(f)}
                className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-ink shadow-sm"
              >
                {f.nome}
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="mb-1 text-center text-[11px] text-brand-ink/50">Deslize para o lado para ver as etapas →</p>
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2">
        {STAGES.map((st) => {
          const col = filtered.filter((l) => l.etapa === st);
          return (
            <div
              key={st}
              className="w-[85vw] max-w-[340px] shrink-0 snap-center"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => void soltarEm(st)}
            >
              <div className={`mb-2 rounded-xl bg-gradient-to-br ${STAGE_COLOR[st]} px-3 py-2`}>
                <span className="text-sm font-extrabold text-brand-deep">{STAGE_LABELS[st]}</span>
                <span className="ml-2 text-xs font-bold text-brand-ink/50">{col.length}</span>
              </div>
              <div className="space-y-2">
                {col.map((l) => (
                  <div
                    key={l.id}
                    draggable
                    onDragStart={() => setDragId(l.id)}
                    onDragEnd={() => setDragId(null)}
                    onClick={() => setOpen(l)}
                    className={`card relative w-full cursor-pointer p-2 pr-7 text-left transition hover:-translate-y-0.5 ${dragId === l.id ? "opacity-50" : ""}`}
                  >
                    <div className="flex gap-2">
                      {l.foto_url ? (
                        <img src={l.foto_url} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                      ) : (
                        <div className="h-10 w-10 shrink-0 rounded-lg bg-brand-pink/10" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-brand-deep">{l.nome || "Sem nome"}</p>
                        {l.endereco && (
                          <p className="flex items-center gap-1 truncate text-[11px] text-brand-ink/50">
                            <MapPin className="h-3 w-3" /> {l.endereco}
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setMoveLead(l); }}
                      className="absolute right-1 top-1 rounded-full p-1.5 hover:bg-black/5"
                      title="Mover para outra etapa"
                    >
                      <ArrowRightLeft className="h-3.5 w-3.5 text-brand-ink/40" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); void excluir(l); }}
                      className="absolute bottom-1 right-1 rounded-full p-1.5 hover:bg-red-50"
                      title="Excluir lead"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-400" />
                    </button>
                  </div>
                ))}
                {col.length === 0 && <p className="rounded-xl border border-dashed border-brand-purple/15 py-4 text-center text-[11px] text-brand-ink/40">vazio</p>}
              </div>
            </div>
          );
        })}
      </div>

      {open && profile && (
        <LeadDrawer
          lead={open}
          profile={profile}
          onClose={() => setOpen(null)}
          onSaved={() => { setOpen(null); onRefresh(); }}
          onGoToAgenda={onGoToAgenda}
          onGoToDoods={onGoToDoods}
        />
      )}

      {moveLead && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/30" onClick={() => setMoveLead(null)}>
          <div className="w-full rounded-t-2xl bg-white p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]" onClick={(e) => e.stopPropagation()}>
            <p className="mb-3 text-sm font-bold text-brand-deep">Mover “{moveLead.nome}” para:</p>
            <div className="grid grid-cols-2 gap-2">
              {STAGES.map((st) => (
                <button
                  key={st}
                  disabled={moveLead.etapa === st}
                  onClick={() => moverPara(st)}
                  className={`btn-ghost ${moveLead.etapa === st ? "opacity-40" : ""}`}
                >
                  {STAGE_LABELS[st]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
