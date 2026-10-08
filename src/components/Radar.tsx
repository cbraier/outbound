import { useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { type Lead } from "@/lib/types";
import LeadDrawer from "@/components/LeadDrawer";
import { googleMapsDirectionsUrl } from "@/lib/geo";
import { openExternalLink } from "@/lib/wa";

function dot(color: string, big = false) {
  const s = big ? 22 : 16;
  return L.divIcon({
    className: "",
    html: `<div style="width:${s}px;height:${s}px;border-radius:9999px;background:${color};box-shadow:0 0 0 3px rgba(255,255,255,0.9),0 1px 6px rgba(0,0,0,.35)"></div>`,
    iconSize: [s, s],
    iconAnchor: [s / 2, s / 2],
  });
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
  const centerPt: [number, number] = center
    ? [center.lat, center.lng]
    : pts.length
    ? [pts[0].lat as number, pts[0].lng as number]
    : [-27.6, -48.6];

  return (
    <>
      {!center && (
        <div className="mx-auto mb-3 max-w-md rounded-2xl border border-brand-purple/20 bg-white/70 p-3 text-center text-xs text-brand-ink/70">
          Dica: cadastre sua <b>localização de atendimento</b> no Perfil para centralizar o mapa em você.
        </div>
      )}
      <div className="mx-auto max-w-md overflow-hidden rounded-2xl border border-brand-purple/20" style={{ height: 420 }}>
        <MapContainer center={centerPt} zoom={13} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; OpenStreetMap'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {center && (
            <>
              <Marker position={[center.lat, center.lng]} icon={dot("#3B0764", true)}>
                <Popup>Você (local de atendimento)</Popup>
              </Marker>
              <Circle center={[center.lat, center.lng]} radius={15000} pathOptions={{ color: "#A855F7", fillOpacity: 0.05 }} />
            </>
          )}
          {pts.map((l) => (
            <Marker key={l.id} position={[l.lat as number, l.lng as number]} icon={dot("#FF5FA2")}>
              <Popup>
                <div className="space-y-1">
                  <b>{l.nome}</b>
                  {l.categoria && <div style={{ fontSize: 11, color: "#6b7280" }}>{l.categoria}</div>}
                  <button
                    onClick={() => setOpen(l)}
                    style={{ display: "block", width: "100%", marginTop: 4, padding: "4px 8px", borderRadius: 8, background: "#FF5FA2", color: "#fff", fontWeight: 700, fontSize: 12, border: 0 }}
                  >
                    Abrir lead
                  </button>
                  <button
                    onClick={() => openExternalLink(googleMapsDirectionsUrl(l.lat as number, l.lng as number))}
                    style={{ display: "block", width: "100%", marginTop: 4, padding: "4px 8px", borderRadius: 8, border: "1px solid #A855F7", color: "#4C1D95", fontWeight: 700, fontSize: 12, background: "#fff" }}
                  >
                    Como chegar
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
      <p className="mx-auto mt-2 max-w-md text-center text-[11px] text-brand-ink/50">
        Toque num ponto para abrir o lead ou “Como chegar”.
      </p>

      {open && profile && (
        <LeadDrawer lead={open} profile={profile} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); onRefresh(); }} />
      )}
    </>
  );
}
