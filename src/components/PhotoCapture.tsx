import { useRef, useState, type ChangeEvent } from "react";
import { supabase } from "@/lib/supabase";
import { getCurrentLocation, getPhotoLocation, reverseGeocode, uploadLeadPhoto, type GeoAddress } from "@/lib/geo";
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
  const MAX = 1600;
  try {
    if (base64.length < 1_500_000) return { base64, mime };
    const img = await carregarImagem(`data:${mime};base64,${base64}`);
    const maior = Math.max(img.naturalWidth, img.naturalHeight);
    const escala = maior > MAX ? MAX / maior : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * escala));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * escala));
    const ctx = canvas.getContext("2d");
    if (!ctx) return { base64, mime };
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const out = canvas.toDataURL("image/jpeg", 0.82).split(",")[1];
    return out && out.length < base64.length ? { base64: out, mime: "image/jpeg" } : { base64, mime };
  } catch {
    return { base64, mime };
  }
}

export default function PhotoCapture({
  userId,
  onCaptured,
  only = "both",
}: {
  userId: string;
  onCaptured: (lead: CapturedLead) => void;
  only?: "camera" | "file" | "both";
}) {
  const [busy, setBusy] = useState(false);
  const camRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const enviar = async (base64: string, mime: string) => {
    setBusy(true);
    try {
      const comp = await comprimir(base64, mime);
      // 1) visão: extrai os dados da fachada
      const { data, error } = await supabase.functions.invoke("ai-message", {
        body: { image_base64: comp.base64, action: "extract" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const ext = (data?.extracted || {}) as Record<string, unknown>;

      // 2) localização (EXIF da foto → GPS do aparelho) + upload
      const exif = await getPhotoLocation(base64);
      const loc = exif || (await getCurrentLocation());
      const url = await uploadLeadPhoto(comp.base64, comp.mime, userId);
      let addr: GeoAddress | null = null;
      if (loc) addr = await reverseGeocode(loc.lat, loc.lng);

      const tags = Array.isArray(ext.tags) ? (ext.tags as string[]) : undefined;
      onCaptured({
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
    } finally {
      setBusy(false);
    }
  };

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      const r = new FileReader();
      r.onload = () => enviar(String(r.result).split(",")[1] || "", f.type || "image/jpeg");
      r.readAsDataURL(f);
    }
    e.currentTarget.value = "";
  };

  return (
    <>
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={onPick} />
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPick} />
      {only !== "file" && (
        <button className="btn-primary w-full" onClick={() => camRef.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />} Tirar foto (câmera)
        </button>
      )}
      {only !== "camera" && (
        <button className="btn-ghost mt-2 w-full" onClick={() => fileRef.current?.click()} disabled={busy}>
          <ImageUp className="h-4 w-4" /> Escolher da galeria
        </button>
      )}
      <p className="mt-2 text-center text-[11px] text-brand-ink/50">
        {busy ? "Lendo a fachada..." : "A foto cria o lead automaticamente"}
      </p>
    </>
  );
}
