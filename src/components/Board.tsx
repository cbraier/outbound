import { useState } from "react";
import { type Lead, STAGES, STAGE_LABELS } from "@/lib/types";
import LeadDrawer from "@/components/LeadDrawer";
import { MapPin } from "lucide-react";

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
}: {
  leads: Lead[];
  profile: Parameters<typeof LeadDrawer>[0]["profile"] | null;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState<Lead | null>(null);
  const followups = leads.filter(
    (l) => l.etapa === "prospect" && l.followup_due_at && new Date(l.followup_due_at) <= new Date() && !l.followup_sent_at,
  );

  return (
    <>
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
      <div className="flex gap-3 overflow-x-auto pb-2">
        {STAGES.map((st) => {
          const col = leads.filter((l) => l.etapa === st);
          return (
            <div key={st} className="w-52 shrink-0">
              <div className={`mb-2 rounded-xl bg-gradient-to-br ${STAGE_COLOR[st]} px-3 py-2`}>
                <span className="text-sm font-extrabold text-brand-deep">{STAGE_LABELS[st]}</span>
                <span className="ml-2 text-xs font-bold text-brand-ink/50">{col.length}</span>
              </div>
              <div className="space-y-2">
                {col.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => setOpen(l)}
                    className="card w-full p-2 text-left transition hover:-translate-y-0.5"
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
                  </button>
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
          onSaved={() => {
            setOpen(null);
            onRefresh();
          }}
        />
      )}
    </>
  );
}
