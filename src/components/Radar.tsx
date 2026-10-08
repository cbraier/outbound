import { useState } from "react";
import { type Lead } from "@/lib/types";
import LeadDrawer from "@/components/LeadDrawer";

const SIZE = 320;
const MAX_KM = 30;

function dist(x: { lat: number; lng: number }, c: { lat: number; lng: number }) {
  const dLat = (x.lat - c.lat) * 111;
  const dLng = (x.lng - c.lng) * 111 * Math.cos((c.lat * Math.PI) / 180);
  return { dx: dLng, dy: dLat, km: Math.sqrt(dx0(x, c) ** 2 + dy0(x, c) ** 2) };
}
function dx0(x: { lng: number }, c: { lng: number; lat: number }) {
  return (x.lng - c.lng) * 111 * Math.cos((c.lat * Math.PI) / 180);
}
function dy0(x: { lat: number }, c: { lat: number }) {
  return (x.lat - c.lat) * 111;
}

export default function Radar({
  leads,
  center,
  profile,
  onRefresh,
}: {
  leads: Lead[];
  center: { lat: number; lng: number } | null;
  profile: Parameters<typeof LeadDrawer>[0]["profile"] | null;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState<Lead | null>(null);
  const pts = leads.filter((l) => l.lat != null && l.lng != null);
  const sc = SIZE / 2 / MAX_KM;

  if (!center) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-brand-purple/20 bg-white/70 p-6 text-center text-sm text-brand-ink/70">
        Cadastre sua <b>localização de atendimento</b> no Perfil (endereço ou “usar minha localização”) para ver os leads ao redor.
      </div>
    );
  }
  if (!pts.length) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-brand-purple/20 bg-white/70 p-6 text-center text-sm text-brand-ink/70">
        Nenhum lead com localização ainda. Cadastre por foto (a localização vem do GPS).
      </div>
    );
  }

  return (
    <>
      <div className="mx-auto max-w-md">
        <p className="mb-2 text-center text-sm font-bold text-brand-deep">Radar — leads ao seu redor</p>
        <div className="relative mx-auto overflow-hidden rounded-2xl border border-brand-purple/20 bg-gradient-to-br from-brand-pink/10 to-brand-purple/10" style={{ width: SIZE, height: SIZE }}>
          {[10, 20, 30].map((km) => (
            <div key={km} className="absolute rounded-full border border-brand-purple/20" style={{ left: SIZE / 2 - km * sc, top: SIZE / 2 - km * sc, width: km * 2 * sc, height: km * 2 * sc }} />
          ))}
          <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-deep ring-4 ring-brand-deep/20" />
          {pts.map((l) => {
            const dx = dx0(l as { lng: number }, center) * sc;
            const dy = -dy0(l as { lat: number }, center) * sc;
            const clamp = (v: number) => Math.max(-SIZE / 2 + 10, Math.min(SIZE / 2 - 10, v));
            return (
              <button
                key={l.id}
                onClick={() => setOpen(l)}
                title={l.nome}
                className="absolute h-3 w-3 rounded-full bg-brand-pink shadow ring-2 ring-white transition hover:scale-150"
                style={{ left: SIZE / 2 + clamp(dx) - 6, top: SIZE / 2 + clamp(dy) - 6 }}
              />
            );
          })}
        </div>
        <p className="mt-2 text-center text-[11px] text-brand-ink/50">Toque num ponto para abrir o lead no kanban.</p>
      </div>

      {open && profile && (
        <LeadDrawer
          lead={open}
          profile={profile}
          onClose={() => setOpen(null)}
          onSaved={() => { setOpen(null); onRefresh(); }}
        />
      )}
    </>
  );
}
