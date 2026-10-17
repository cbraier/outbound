import { useRef, useState, type ChangeEvent } from "react";
import { supabase } from "@/lib/supabase";
import { getCurrentLocation, reverseGeocode, uploadLeadPhoto, type GeoAddress } from "@/lib/geo";
import { chargeDood } from "@/lib/dood";
import { Camera, ImageUp, Loader2 } from "lucide-react";

export interface CapturedLead {
  contato?: string;
  nome?: string;
  telefone?: string;
  rede_social?: string;
  site?: string;
  rua?: string;
  numero?: string;
  complemento?: string;
  endereco?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  categoria?: string;
  tags?: string[];
  foto_url?: string;
  lat?: number;
  lng?: number;
}

async function carregarImagem(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("imagem inválida"));
    img.src = src;
  });
}

async function comprimir(base64: string, mime: string): Promise<{ base64: string; mime: string }> {
  const MAX = 1280;
  const LIMITE = 800_000; // ~800 KB de base64 — envia rápido e evita falha de rede no celular
  try {
    if (base64.length < LIMITE) return { base64, mime };
    const img = await carregarImagem(`data:${mime};base64,${base64}`);
    const maior = Math.max(img.naturalWidth, img.naturalHeight);
    const escala = maior > MAX ? MAX / maior : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * escala));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * escala));
    const ctx = canvas.getContext("2d");
    if (!ctx) return { base64, mime };
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const q of [0.8, 0.7, 0.6]) {
      const out = canvas.toDataURL("image/jpeg", q).split(",")[1];
      if (out && out.length < LIMITE) return { base64: out, mime: "image/jpeg" };
    }
    const out = canvas.toDataURL("image/jpeg", 0.6).split(",")[1];
    return out && out.length < base64.length ? { base64: out, mime: "image/jpeg" } : { base64, mime };
  } catch {
    return { base64, mime };
  }
}

export default function PhotoCapture({
  userId,
  onCaptured,
  only = "both",
  disabled = false,
}: {
  userId: string;
  onCaptured: (lead: CapturedLead) => void | Promise<void>;
  only?: "camera" | "file" | "both";
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [pending, setPending] = useState<{ b64: string; mime: string } | null>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const enviar = async (base64: string, mime: string) => {
    setBusy(true);
    setMsg("");
    try {
      const ch = await chargeDood("lead_vision");
      if (!ch.ok) {
        alert("Sem Doods suficientes para ler a imagem. Recarregue na aba Dood's.");
        return;
      }
      const comp = await comprimir(base64, mime);
      // 1) visão: extrai os dados da fachada (tenta 2x — rede do celular oscila)
      const reqBody = { image_base64: comp.base64, action: "extract" };
      let r = await supabase.functions.invoke("ai-message", { body: reqBody });
      if (r.error) {
        await new Promise((res) => setTimeout(res, 1500));
        r = await supabase.functions.invoke("ai-message", { body: reqBody });
      }
      const { data, error } = r;
      if (error) {
        const em = (error as { message?: string }).message || "";
        throw new Error(/failed to send|network|fetch|load failed/i.test(em)
          ? "A conexão falhou ao enviar a foto. Verifique a internet e tente de novo."
          : em || "Não consegui ler a foto.");
      }
      if (data?.error) throw new Error(data.error);
      const ext = (data?.extracted || {}) as Record<string, unknown>;

      // 2) localização: SOMENTE quando a foto é tirada na hora (câmera), pois você está no local.
      // Arquivo/Imagem, Áudio e Manual NUNCA pegam localização.
      const loc = only === "camera" ? await getCurrentLocation() : null;
      const url = await uploadLeadPhoto(comp.base64, comp.mime, userId);
      let addr: GeoAddress | null = null;
      if (loc) addr = await reverseGeocode(loc.lat, loc.lng);

      const tags = Array.isArray(ext.tags) ? (ext.tags as string[]) : undefined;
      await onCaptured({
        nome: (ext.nome as string) || undefined,
        telefone: ((ext.celular as string) || (ext.telefone as string) || undefined)?.replace(/\D/g, "") || undefined,
        rede_social: (ext.rede_social as string) || undefined,
        site: (ext.site as string) || undefined,
        endereco: (ext.endereco as string) || addr?.endereco || undefined,
        bairro: (ext.bairro as string) || addr?.bairro || undefined,
        cidade: (ext.cidade as string) || addr?.cidade || undefined,
        estado: (ext.estado as string) || addr?.estado || undefined,
        cep: (ext.cep as string) || addr?.cep || undefined,
        categoria: (ext.categoria as string) || undefined,
        tags,
        foto_url: url || undefined,
        lat: loc?.lat,
        lng: loc?.lng,
      });
      setMsg("✓ Lead criado! Já está no Funil.");
    } catch (e) {
      const m = e instanceof Error ? e.message : "Não consegui ler a foto.";
      setMsg("Erro: " + m);
      alert("Não consegui ler a foto agora.\n\n" + m);
    } finally {
      setBusy(false);
    }
  };

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      const r = new FileReader();
      r.onload = () => setPending({ b64: String(r.result).split(",")[1] || "", mime: f.type || "image/jpeg" });
      r.readAsDataURL(f);
    }
    e.currentTarget.value = "";
  };

  return (
    <>
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={onPick} />
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPick} />
      {only !== "file" && (
        <button className="btn-primary w-full" onClick={() => camRef.current?.click()} disabled={busy || disabled}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />} Tirar foto (câmera)
        </button>
      )}
      {only !== "camera" && (
        <button className="btn-ghost mt-2 w-full" onClick={() => fileRef.current?.click()} disabled={busy || disabled}>
          <ImageUp className="h-4 w-4" /> Escolher da galeria
        </button>
      )}
      {busy ? (
        <div className="mt-2 flex flex-col items-center gap-2">
          <p className="flex items-center justify-center gap-2 text-[11px] font-semibold">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-purple" />
            <span className="gemini-text">Lendo a imagem...</span>
          </p>
          <div className="gemini-bar w-40" />
        </div>
      ) : (
        <p className={`mt-2 text-center text-[11px] ${msg.startsWith("Erro") ? "font-semibold text-red-500" : "text-brand-ink/60"}`}>
          {msg || "A foto cria o lead automaticamente"}
        </p>
      )}

      {pending && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" onClick={() => setPending(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-3" onClick={(e) => e.stopPropagation()}>
            <p className="mb-2 text-sm font-bold text-brand-deep">Usar esta imagem?</p>
            <img src={`data:${pending.mime};base64,${pending.b64}`} alt="" className="mb-3 max-h-[55vh] w-full rounded-xl bg-black/5 object-contain" />
            <div className="flex gap-2">
              <button className="btn-ghost flex-1" onClick={() => setPending(null)}>Cancelar</button>
              <button
                className="btn-primary flex-1"
                onClick={() => { const p = pending; setPending(null); if (p) void enviar(p.b64, p.mime); }}
              >
                Usar esta imagem
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
