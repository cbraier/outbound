import { supabase } from "@/lib/supabase";

const BUCKET = "profile_docs";

export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(head)?.[1] || "application/octet-stream";
  const bin = atob(body || "");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function compressLogo(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = dataUrl;
    });
    const max = 640;
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } catch {
    return dataUrl;
  }
}

export async function uploadBrandLogo(userId: string, file: File): Promise<string> {
  const dataUrl = await compressLogo(file);
  const blob = dataUrlToBlob(dataUrl);
  const path = `${userId}/brand/logo.png`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: "image/png" });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function findBrandLogo(userId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage.from(BUCKET).list(`${userId}/brand`, { limit: 10 });
    if (error || !data?.length) return null;
    const logo = data.find((f) => /^logo\.(png|jpe?g|webp)$/i.test(f.name));
    if (!logo) return null;
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(`${userId}/brand/${logo.name}`);
    return pub.publicUrl;
  } catch {
    return null;
  }
}

export async function imageUrlToDataUrl(url: string): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const blob = await r.blob();
    return await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ""));
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
