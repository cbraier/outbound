import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { type Lead } from "@/lib/types";
import LeadDrawer from "@/components/LeadDrawer";
import CollapsibleCard from "@/components/CollapsibleCard";
import { supabase } from "@/lib/supabase";
import { chargeDood } from "@/lib/dood";
import { useAuth } from "@/contexts/AuthContext";
import { getCurrentLocation, reverseGeocode, googleMapsDirectionsUrl } from "@/lib/geo";
import { openExternalLink } from "@/lib/wa";
import { Loader2, MapPin, Search } from "lucide-react";

function dot(color: string, big = false) {
  const s = big ? 22 : 16;
  return L.divIcon({
    className: "",
    html: `<div style="width:${s}px;height:${s}px;border-radius:9999px;background:${color};box-shadow:0 0 0 3px rgba(255,255,255,0.9),0 1px 6px rgba(0,0,0,.35)"></div>`,
    iconSize: [s, s],
    iconAnchor: [s / 2, s / 2],
  });
}

function distKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
function fmtDist(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1).replace(".", ",")} km`;
}
function osmTileUrl(lat: number, lng: number, z: number): string {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
}
function tagFromSector(s: string): string {
  const w =
    (s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]/g, " ")
      .trim()
      .split(/\s+/)[0] || "";
  return w.replace(/s$/, "");
}

type DiscItem = { nome?: string; site?: string; telefone?: string; cidade?: string; endereco?: string; lat?: number; lng?: number; dist_km?: number | null; _km?: number | null };

type RadarProfile = {
  ai_instruction: string | null;
  professional_profile: string | null;
  fixed_message: string | null;
  followup_message?: string | null;
  ai_provider: string | null;
  ai_api_key: string | null;
  site: string | null;
  region?: string | null;
  radius_km?: number | null;
  work_address?: string | null;
  work_lat?: number | null;
  work_lng?: number | null;
};

export default function Radar({
  leads,
  profile,
  onRefresh,
}: {
  leads: Lead[];
  profile: RadarProfile | null;
  onRefresh: () => void;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState<Lead | null>(null);

  const [workAddress, setWorkAddress] = useState(profile?.work_address || "");
  const [radiusKm, setRadiusKm] = useState(Number(profile?.radius_km) || 15);
  const [region, setRegion] = useState(profile?.region || "");
  const [workLat, setWorkLat] = useState(Number(profile?.work_lat) || 0);
  const [workLng, setWorkLng] = useState(Number(profile?.work_lng) || 0);
  const [savingAddr, setSavingAddr] = useState(false);

  const [discSector, setDiscSector] = useState(() => sessionStorage.getItem("ob_disc_sector") || "");
  const [discList, setDiscList] = useState<DiscItem[]>(() => {
    try { return JSON.parse(sessionStorage.getItem("ob_disc_list") || "[]") as DiscItem[]; } catch { return []; }
  });
  const [discBusy, setDiscBusy] = useState(false);
  const [discMsg, setDiscMsg] = useState(() => sessionStorage.getItem("ob_disc_msg") || "");
  const [discSel, setDiscSel] = useState<number[]>(() => {
    try { return JSON.parse(sessionStorage.getItem("ob_disc_sel") || "[]") as number[]; } catch { return []; }
  });
  const [addBusy, setAddBusy] = useState(false);

  useEffect(() => { sessionStorage.setItem("ob_disc_sector", discSector); }, [discSector]);
  useEffect(() => { sessionStorage.setItem("ob_disc_list", JSON.stringify(discList)); }, [discList]);
  useEffect(() => { sessionStorage.setItem("ob_disc_msg", discMsg); }, [discMsg]);
  useEffect(() => { sessionStorage.setItem("ob_disc_sel", JSON.stringify(discSel)); }, [discSel]);

  const radiusTimer = useRef<number | null>(null);

  useEffect(() => {
    setWorkAddress(profile?.work_address || "");
    setRadiusKm(Number(profile?.radius_km) || 15);
    setRegion(profile?.region || "");
    setWorkLat(Number(profile?.work_lat) || 0);
    setWorkLng(Number(profile?.work_lng) || 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.work_address, profile?.radius_km, profile?.region, profile?.work_lat, profile?.work_lng]);

  const salvarPerfil = async (patch: Record<string, unknown>) => {
    if (!user) return;
    await supabase.from("profiles").update(patch as never).eq("user_id", user.id);
    onRefresh();
  };

  const usarLocalizacao = async () => {
    setSavingAddr(true);
    try {
      const loc = await getCurrentLocation();
      if (!loc) {
        alert("Não consegui pegar sua localização. Confira a permissão do app.");
        return;
      }
      setWorkLat(loc.lat);
      setWorkLng(loc.lng);
      const addr = await reverseGeocode(loc.lat, loc.lng);
      const rua = [addr?.endereco, addr?.bairro, addr?.cidade].filter(Boolean).join(", ");
      if (rua) setWorkAddress(rua);
      await salvarPerfil({ work_lat: loc.lat, work_lng: loc.lng, ...(rua ? { work_address: rua } : {}) });
      alert(rua ? `Localização salva: ${rua}` : "Localização de atendimento salva!");
    } finally {
      setSavingAddr(false);
    }
  };

  const onRadius = (v: number) => {
    setRadiusKm(v);
    if (radiusTimer.current) window.clearTimeout(radiusTimer.current);
    radiusTimer.current = window.setTimeout(() => { void salvarPerfil({ radius_km: v }); }, 600);
  };

  const buscarSetor = async () => {
    if (!discSector.trim()) return;
    if (!workLat || !workLng) {
      setDiscMsg("Defina sua localização em Atendimento (botão do alfinete) para buscar dentro do seu raio.");
      alert("Primeiro defina sua localização: toque em 'Usar minha localização agora' (bloco amarelo) ou no alfinete em Atendimento.");
      return;
    }
    setDiscBusy(true);
    setDiscMsg("");
    setDiscList([]);
    try {
      const ch = await chargeDood("radar_discover");
      if (!ch.ok) { setDiscMsg("Sem Doods suficientes. Recarregue na aba Dood's."); return; }
      const { data, error } = await supabase.functions.invoke("ai-message", {
        body: {
          action: "discover",
          sector: discSector.trim(),
          region,
          city: workAddress || undefined,
          radius: radiusKm,
          lat: workLat,
          lng: workLng,
          limit: 20,
        },
      });
      if (error) throw error;
      if (data?.error) {
        setDiscMsg(data.error);
        return;
      }
      const base = (data.negocios || []) as DiscItem[];
      const withD = base
        .map((n) => ({
          ...n,
          _km: typeof n.dist_km === "number"
            ? n.dist_km
            : n.lat != null && n.lng != null
            ? distKm(workLat, workLng, n.lat, n.lng)
            : null,
        }))
        .sort((a, b) => (a._km ?? 1e9) - (b._km ?? 1e9));
      setDiscList(withD);
      setDiscSel([]);
      if (!withD.length) setDiscMsg(data.aviso || `Nada num raio de ${radiusKm} km. Aumente o raio ou tente outro setor.`);
    } catch (e) {
      setDiscMsg(e instanceof Error ? e.message : "Falha na busca");
    } finally {
      setDiscBusy(false);
    }
  };

  const addDiscoverLead = async (n: DiscItem, buscarImagem = true): Promise<boolean> => {
    if (!user) return false;
    const tag = tagFromSector(discSector);
    let site = (n.site || "").trim();
    let telefone = (n.telefone || "").replace(/\D/g, "");
    let cidade = (n.cidade || "").trim();
    let endereco = (n.endereco || "").trim();
    let rede = "";
    // O OSM costuma vir SEM telefone/site → busca na web (Exa/Tavily) antes de subir.
    if (buscarImagem && (!telefone || !site)) {
      const ch = await chargeDood("radar_enrich", n.nome || undefined);
      if (!ch.ok) { alert("Sem Doods suficientes para importar o contato. Recarregue na aba Dood's."); return false; }
      try {
        const { data } = await supabase.functions.invoke("ai-message", {
          body: { action: "enrich", nome: n.nome, city: n.cidade || n.endereco || undefined, region: region || undefined, phone: telefone || undefined },
        });
        if (data && !data.error) {
          if (!telefone && data.telefone) telefone = String(data.telefone).replace(/\D/g, "");
          if (!site && data.site) site = String(data.site);
          if (!cidade && data.cidade) cidade = String(data.cidade);
          if (!endereco && data.endereco) endereco = String(data.endereco);
          if (data.rede_social) rede = String(data.rede_social);
        }
      } catch { /* ignora */ }
    }
    // Imagem de referência (logo/og:image do site, favicon, ou um pedaço de mapa do local).
    let foto_url: string | null = null;
    try {
      const { data } = await supabase.functions.invoke("ai-message", {
        body: { action: "ogimage", site: site || undefined, nome: n.nome || undefined, city: cidade || endereco || undefined, buscar: buscarImagem },
      });
      if (data?.image) foto_url = String(data.image);
    } catch { /* ignora */ }
    if (!foto_url && site) {
      const dom = site.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
      if (dom) foto_url = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(dom)}&sz=128`;
    }
    if (!foto_url && n.lat != null && n.lng != null) foto_url = osmTileUrl(n.lat, n.lng, 16);
    const { error } = await supabase.from("leads").insert({
      user_id: user.id,
      nome: n.nome || "Sem nome",
      site: site || null,
      telefone: telefone || null,
      rede_social: rede || null,
      cidade: cidade || null,
      endereco: endereco || null,
      lat: n.lat ?? null,
      lng: n.lng ?? null,
      foto_url,
      tags: tag ? [tag] : [],
      etapa: "lead",
      origem: "discovery",
    } as never);
    if (error) {
      alert("Erro ao adicionar: " + error.message);
      return false;
    }
    setDiscList((l) => l.filter((x) => x !== n));
    return true;
  };

  const adicionarVarios = async (items: DiscItem[]) => {
    if (!items.length || addBusy) return;
    setAddBusy(true);
    setDiscMsg("");
    const buscarImg = true; // sempre tenta buscar contato (telefone/site) e imagem
    let ok = 0;
    for (const n of items) if (await addDiscoverLead(n, buscarImg)) ok++;
    setDiscSel([]);
    onRefresh();
    setDiscMsg(`${ok} lead(s) adicionado(s) ao Funil. Abra a aba "Funil" para ver.`);
    setAddBusy(false);
  };

  const pts = leads.filter((l) => l.lat != null && l.lng != null);
  const center = workLat && workLng ? { lat: workLat, lng: workLng } : null;
  const centerPt: [number, number] = center ? [center.lat, center.lng] : pts.length ? [pts[0].lat as number, pts[0].lng as number] : [-27.6, -48.6];
  const zoom = radiusKm <= 5 ? 13 : radiusKm <= 15 ? 12 : radiusKm <= 40 ? 11 : radiusKm <= 70 ? 10 : 9;

  return (
    <div className="space-y-3">
      {(!workLat || !workLng) && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-extrabold text-amber-800">Configure sua localização primeiro</p>
          <p className="mt-1 text-[12px] leading-snug text-amber-800/90">
            O Radar e o "Descobrir negócios (por setor)" só encontram o que existe perto de você depois que você salva sua localização e define o raio. É rápido: toque no botão abaixo.
          </p>
          <button className="btn-primary mt-3 w-full" onClick={usarLocalizacao} disabled={savingAddr}>
            {savingAddr ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />} Usar minha localização agora
          </button>
        </div>
      )}
      <CollapsibleCard title="Atendimento" subtitle="Onde você atende e até quantos km se desloca." storageKey="atendimento">
        <div className="space-y-3">
          <div>
            <span className="label">Endereço / local de atendimento</span>
            <div className="flex gap-2">
              <input
                className="input"
                value={workAddress}
                onChange={(e) => setWorkAddress(e.target.value)}
                onBlur={() => void salvarPerfil({ work_address: workAddress })}
                placeholder="Toque no alfinete para usar sua localização"
              />
              <button className="btn-ghost shrink-0 !px-3" onClick={usarLocalizacao} disabled={savingAddr} title="Usar minha localização">
                {savingAddr ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div>
            <span className="label">Raio de atendimento: {radiusKm} km</span>
            <input type="range" min={1} max={100} value={radiusKm} onChange={(e) => onRadius(Number(e.target.value))} className="w-full accent-brand-pink" />
          </div>
          <div>
            <span className="label">Região / cidades de atendimento</span>
            <input
              className="input"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              onBlur={() => void salvarPerfil({ region })}
              placeholder="Palhoça, São José, Biguaçu"
            />
            <p className="mt-1 text-[10px] text-brand-ink/60">Separe por vírgula. A pesquisa na web fica <b>travada nessa região</b>.</p>
          </div>
        </div>
      </CollapsibleCard>

      <CollapsibleCard title="Descobrir negócios (por setor)" subtitle="Empresas dentro do seu raio, ordenadas pelas mais próximas." storageKey="descobrir">
        <div className="space-y-2">
          <div className="flex gap-2">
            <input className="input" value={discSector} onChange={(e) => setDiscSector(e.target.value)} placeholder="Ex.: padarias, oficinas, pet shops" />
            <button className="btn-primary shrink-0" onClick={buscarSetor} disabled={discBusy || !discSector.trim()}>
              {discBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Buscar
            </button>
          </div>
          <p className="text-[10px] text-brand-ink/60">
            Usa o seu <b>raio de {radiusKm} km</b>. Depois é só adicionar como leads no funil.
          </p>
          {discBusy && <p className="text-[11px] font-semibold text-brand-ink/70">Buscando "{discSector}" num raio de {radiusKm} km…</p>}
          {discMsg && <p className="text-[11px] text-brand-ink/70">{discMsg}</p>}
          {discList.length > 0 && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <button className="btn-primary flex-1 !py-1.5 !text-xs" disabled={!discSel.length || addBusy} onClick={() => void adicionarVarios(discSel.map((i) => discList[i]))}>
                  {addBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Adicionar selecionados ({discSel.length})
                </button>
                <button className="btn-ghost flex-1 !py-1.5 !text-xs" disabled={addBusy} onClick={() => void adicionarVarios([...discList])}>
                  Adicionar todos ({discList.length})
                </button>
              </div>
              {discList.map((n, i) => {
                const sel = discSel.includes(i);
                return (
                  <label key={i} className={`flex items-center gap-2 rounded-xl border p-2 ${sel ? "border-brand-pink bg-brand-pink/5" : "border-brand-purple/15 bg-white/60"}`}>
                    <input type="checkbox" checked={sel} onChange={() => setDiscSel((s) => (sel ? s.filter((x) => x !== i) : [...s, i]))} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-brand-deep">{n.nome}</p>
                      <p className="truncate text-[11px] text-brand-ink/50">{[n.endereco || n.cidade, n.site].filter(Boolean).join(" · ")}</p>
                    </div>
                    {typeof n._km === "number" && (
                      <span className="shrink-0 rounded-full bg-brand-purple/10 px-2 py-0.5 text-[10px] font-bold text-brand-deep">{fmtDist(n._km)}</span>
                    )}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </CollapsibleCard>

      <div className="mx-auto max-w-md overflow-hidden rounded-2xl border border-brand-purple/20" style={{ height: 420 }}>
        <MapContainer center={centerPt} zoom={zoom} style={{ height: "100%", width: "100%" }}>
          <TileLayer attribution="&copy; OpenStreetMap" url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {center && (
            <>
              <Marker position={[center.lat, center.lng]} icon={dot("#3B0764", true)}>
                <Popup>Você (local de atendimento)</Popup>
              </Marker>
              <Circle center={[center.lat, center.lng]} radius={radiusKm * 1000} pathOptions={{ color: "#A855F7", fillOpacity: 0.05 }} />
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
      <p className="mx-auto max-w-md text-center text-[11px] text-brand-ink/50">
        Círculo = seu raio de atendimento ({radiusKm} km). Ajuste acima, em Atendimento.
      </p>

      {open && profile && <LeadDrawer lead={open} profile={profile} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); onRefresh(); }} />}
    </div>
  );
}
