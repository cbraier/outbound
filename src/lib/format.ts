/** Máscara de telefone BR: (48) 99999-9999 — avança sozinho após o DDD. */
export function maskPhone(v: string): string {
  const d = (v || "").replace(/\D/g, "").slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function phoneDigits(v: string): string {
  return (v || "").replace(/\D/g, "");
}

/** Normaliza site/URL: sem protocolo vira https:// */
export function withHttps(v: string): string {
  const s = (v || "").trim();
  if (!s) return "";
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

/** Converte @handle em URL completa da rede (o app preenche automaticamente). */
export function socialUrl(key: string, raw: string): string {
  const v = (raw || "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  const h = v.replace(/^@/, "").replace(/\s+/g, "");
  switch (key) {
    case "instagram": return `https://instagram.com/${h}`;
    case "facebook": return `https://facebook.com/${h}`;
    case "linkedin": return `https://www.linkedin.com/in/${h}`;
    case "tiktok": return `https://www.tiktok.com/@${h}`;
    case "youtube": return `https://youtube.com/@${h}`;
    case "whatsapp": return `https://wa.me/55${h.replace(/\D/g, "")}`;
    default: return v;
  }
}

/** Máscara de CEP 00000-000 */
export function maskCep(v: string): string {
  const d = (v || "").replace(/\D/g, "").slice(0, 8);
  return d.length <= 5 ? d : `${d.slice(0, 5)}-${d.slice(5)}`;
}

/** Busca endereço pelo CEP (ViaCEP, sem chave). */
export async function lookupCep(cep: string): Promise<{ rua?: string; bairro?: string; cidade?: string; estado?: string } | null> {
  const d = (cep || "").replace(/\D/g, "");
  if (d.length !== 8) return null;
  try {
    const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
    const j = await r.json();
    if (j?.erro) return null;
    return { rua: j.logradouro || "", bairro: j.bairro || "", cidade: j.localidade || "", estado: j.uf || "" };
  } catch {
    return null;
  }
}
