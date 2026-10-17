import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { getCurrentLocation, reverseGeocode } from "@/lib/geo";
import { socialUrl } from "@/lib/format";
import { findBrandLogo, uploadBrandLogo } from "@/lib/brand";
import CollapsibleCard from "@/components/CollapsibleCard";
import { Loader2, Save, Paperclip, MapPin, X, Mic, Square, Sparkles, Copy, Send, Search, Image as ImageIcon, Trash2 } from "lucide-react";

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

async function blobToB64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] || "");
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

function MicInto({ onText }: { onText: (t: string) => void }) {
  const [rec, setRec] = useState(false);
  const [busy, setBusy] = useState(false);
  const mr = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const m = new MediaRecorder(stream);
      chunks.current = [];
      m.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      m.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setBusy(true);
        try {
          const blob = new Blob(chunks.current, { type: m.mimeType || "audio/webm" });
          const b64 = await blobToB64(blob);
          const { data, error } = await supabase.functions.invoke("ai-message", { body: { audio_base64: b64, audio_mime: blob.type } });
          if (error) throw error;
          if (data?.transcript) onText(String(data.transcript));
          else alert("Não consegui transcrever o áudio.");
        } catch (e) {
          alert(e instanceof Error ? e.message : "Falha no áudio");
        } finally {
          setBusy(false);
        }
      };
      mr.current = m;
      m.start();
      setRec(true);
    } catch {
      alert("Sem acesso ao microfone.");
    }
  };
  const stop = () => { mr.current?.stop(); setRec(false); };
  return (
    <button type="button" onClick={rec ? stop : start} disabled={busy} className="btn-ghost !px-2 !py-1 !text-[11px]" title="Ditar por voz">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : rec ? <Square className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
      {rec ? "Parar" : "Ditar"}
    </button>
  );
}

const PROVIDERS = [
  { v: "default", label: "Padrão do app" },
  { v: "gemini", label: "Gemini (minha chave)" },
  { v: "openai", label: "ChatGPT / OpenAI (minha chave)" },
  { v: "anthropic", label: "Claude / Anthropic (minha chave)" },
  { v: "deepseek", label: "DeepSeek (minha chave)" },
];

const FOLLOWUP_PADRAO =
  "Olá, tudo bem? {saudacao}!\n\nPasso pra retomar a mensagem que te enviei ontem — imagino que talvez não tenha tido tempo de dar uma olhadinha. Gostaria muito que você guardasse meu contato para o futuro, caso precise.\n\nAproveito pra perguntar:\n1) Você está satisfeita(o) hoje com sua presença digital?\n2) Ainda não teve tempo de analisar?\n3) Não tenho interesse.\n4) Vou guardar seu contato e, se precisar, eu chamo.";

const SOCIAL_KEYS = [
  { k: "instagram", label: "Instagram" },
  { k: "facebook", label: "Facebook" },
  { k: "linkedin", label: "LinkedIn" },
  { k: "tiktok", label: "TikTok" },
  { k: "youtube", label: "YouTube" },
  { k: "whatsapp", label: "WhatsApp" },
] as const;

function withHttps(v: string): string {
  const s = (v || "").trim();
  if (!s) return "";
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

async function extrairTexto(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) {
    const pdfjs: any = await import("pdfjs-dist");
    const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const data = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data }).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((it: { str?: string }) => it.str || "").join(" ") + "\n";
    }
    return text.trim();
  }
  if (name.endsWith(".docx")) {
    const mammoth: any = await import("mammoth/mammoth.browser");
    const m = mammoth.default || mammoth;
    const arrayBuffer = await file.arrayBuffer();
    const { value } = await m.extractRawText({ arrayBuffer });
    return String(value || "").trim();
  }
  throw new Error("Formato não suportado. Use PDF ou DOCX.");
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

export default function ProfilePage({ onRefresh }: { onRefresh?: () => void }) {
  const { user, signOut, updatePassword } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const [newPwd, setNewPwd] = useState("");
  const [newPwd2, setNewPwd2] = useState("");
  const [pwdBusy, setPwdBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState("");
  const [researchConsent, setResearchConsent] = useState(false);
  const [researching, setResearching] = useState(false);
  const [researchDraft, setResearchDraft] = useState("");
  const [researchQs, setResearchQs] = useState<string[]>([]);
  const [answers, setAnswers] = useState("");
  const [interviewLog, setInterviewLog] = useState<{ q: string; a: string }[]>([]);
  const [interviewQ, setInterviewQ] = useState("");
  const [interviewA, setInterviewA] = useState("");
  const [interviewPerfil, setInterviewPerfil] = useState("");
  const [interviewing, setInterviewing] = useState(false);
  const [interviewDone, setInterviewDone] = useState(false);
  const [discSector, setDiscSector] = useState("");
  type DiscItem = { nome?: string; site?: string; telefone?: string; cidade?: string; endereco?: string; lat?: number; lng?: number; dist_km?: number | null; _km?: number | null };
  const [discList, setDiscList] = useState<DiscItem[]>([]);
  const [discBusy, setDiscBusy] = useState(false);
  const [discMsg, setDiscMsg] = useState("");
  const [discSel, setDiscSel] = useState<number[]>([]);
  const [addBusy, setAddBusy] = useState(false);
  const [docBusy, setDocBusy] = useState(false);
  const [docName, setDocName] = useState("");
  const docRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [brandColor, setBrandColor] = useState("#A855F7");
  const [logoBusy, setLogoBusy] = useState(false);
  const [f, setF] = useState({
    nome: "",
    company: "",
    site: "",
    ai_instruction: "",
    professional_profile: "",
    fixed_message: "",
    followup_message: FOLLOWUP_PADRAO,
    ai_provider: "default",
    ai_api_key: "",
    ai_keys: {} as Record<string, string>,
    work_address: "",
    radius_km: 15,
    region: "",
    work_lat: 0,
    work_lng: 0,
    resume_text: "",
    resume_url: "",
    resume_summary: "",
    socials: {} as Record<string, string>,
  });

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(async ({ data }) => {
        if (data) {
          setF({
            nome: data.nome || "",
            company: data.company || "",
            site: data.site || "",
            ai_instruction: data.ai_instruction || "",
            professional_profile: data.professional_profile || "",
            fixed_message: data.fixed_message || "",
            followup_message: data.followup_message || FOLLOWUP_PADRAO,
            ai_provider: data.ai_provider || "default",
            ai_api_key: ((data.ai_keys as Record<string, string>) || {})[data.ai_provider || "default"] || data.ai_api_key || "",
            ai_keys: (data.ai_keys as Record<string, string>) || {},
            work_address: data.work_address || "",
            radius_km: data.radius_km ?? 15,
            region: data.region || "Florianópolis, São José, Palhoça, Biguaçu, Garopaba",
            work_lat: (data.work_lat as number) || 0,
            work_lng: (data.work_lng as number) || 0,
            resume_text: data.resume_text || "",
            resume_url: data.resume_url || "",
            resume_summary: data.resume_summary || "",
            socials: (data.socials as Record<string, string>) || {},
          });
          const socials = (data.socials as Record<string, string>) || {};
          setLogoUrl(socials._logo || (await findBrandLogo(user.id)));
          setBrandColor(socials._brand_color || "#A855F7");
          setResearchConsent(!!data.research_consent);
        }
        setLoading(false);
      });
  }, [user?.id]);

  // Autosave dos campos de mensagem (evita perder o que foi digitado sem tocar em Atualizar)
  const firstLoad = useRef(true);
  useEffect(() => {
    if (loading || !user?.id) return;
    if (firstLoad.current) { firstLoad.current = false; return; }
    const t = window.setTimeout(async () => {
      await supabase.from("profiles").upsert({
        user_id: user.id,
        email: user.email,
        ai_instruction: f.ai_instruction,
        professional_profile: f.professional_profile,
        fixed_message: f.fixed_message,
        followup_message: f.followup_message,
        socials: f.socials,
        site: withHttps(f.site),
        work_address: f.work_address,
        radius_km: Number(f.radius_km) || 15,
        region: f.region,
        ai_provider: f.ai_provider,
        ai_api_key: f.ai_api_key,
        ai_keys: f.ai_keys,
      } as never, { onConflict: "user_id" });
    }, 1500);
    return () => window.clearTimeout(t);
  }, [f.ai_instruction, f.professional_profile, f.fixed_message, f.followup_message, f.socials, f.site, f.work_address, f.radius_km, f.region, f.ai_provider, f.ai_api_key, f.ai_keys]);

  const salvar = async () => {
    if (!user) return;
    setSaving(true);
    const payload = {
      user_id: user.id,
      email: user.email,
      ...f,
      site: withHttps(f.site),
      radius_km: Number(f.radius_km) || 15,
    };
    const { error } = await supabase.from("profiles").upsert(payload as never, { onConflict: "user_id" });
    setSaving(false);
    if (error) {
      alert("Não deu pra salvar agora (conexão). Tente de novo.\n\n" + error.message);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const testarIA = async () => {
    setTesting(true);
    setTestMsg("");
    try {
      const { data, error } = await supabase.functions.invoke("ai-message", {
        body: { action: "test", provider: f.ai_provider, api_key: f.ai_api_key || undefined },
      });
      if (error) throw error;
      if (data?.ok) setTestMsg(`✓ Funcionou (${data.provider}). Resposta: "${data.sample}"`);
      else setTestMsg(`✗ ${data?.error || "Falhou"}`);
    } catch (e) {
      setTestMsg(`✗ ${e instanceof Error ? e.message : "Falhou"}`);
    } finally {
      setTesting(false);
    }
  };

  const pesquisar = async () => {
    if (!user) return;
    if (!researchConsent) {
      alert("Marque o consentimento para a pesquisa (LGPD).");
      return;
    }
    setResearching(true);
    setResearchDraft("");
    setResearchQs([]);
    try {
      const { data, error } = await supabase.functions.invoke("ai-message", {
        body: { action: "research", nome: f.nome, company: f.company, site: f.site, socials: f.socials, instrucao: f.ai_instruction },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResearchDraft(data.perfil || "");
      setResearchQs(Array.isArray(data.perguntas) ? data.perguntas : []);
      await supabase.from("profiles").update({
        research_consent: true,
        research_at: new Date().toISOString(),
        research_sources: { siteRead: data.siteRead || 0 },
      } as never).eq("user_id", user.id);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Falha na pesquisa");
    } finally {
      setResearching(false);
    }
  };

  const chamarEntrevista = async (log: { q: string; a: string }[]) => {
    const { data, error } = await supabase.functions.invoke("ai-message", {
      body: {
        action: "interview",
        history: log,
        context: {
          nome: f.nome,
          empresa: f.company,
          site: f.site,
          redes: f.socials,
          endereco_atendimento: f.work_address,
          raio_km: f.radius_km,
          sobre_o_negocio: f.ai_instruction,
          perfil_profissional: f.professional_profile,
          curriculo: (f.resume_text || "").slice(0, 3000),
        },
      },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    setInterviewPerfil(data.perfil || "");
    setInterviewQ(data.pergunta || "");
    setInterviewDone(!!data.pronto);
  };

  const iniciarEntrevista = async () => {
    setInterviewing(true);
    setInterviewLog([]);
    setInterviewA("");
    setInterviewDone(false);
    try {
      await chamarEntrevista([]);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Falha na entrevista");
    } finally {
      setInterviewing(false);
    }
  };

  const responderEntrevista = async () => {
    if (!interviewA.trim()) return;
    const log = [...interviewLog, { q: interviewQ, a: interviewA.trim() }];
    setInterviewLog(log);
    setInterviewA("");
    setInterviewing(true);
    try {
      await chamarEntrevista(log);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Falha na entrevista");
    } finally {
      setInterviewing(false);
    }
  };

  const buscarSetor = async () => {
    if (!discSector.trim()) return;
    if (!f.work_lat || !f.work_lng) {
      setDiscMsg("Defina sua localização em Atendimento (botão do alfinete) para buscar dentro do seu raio.");
      return;
    }
    setDiscBusy(true);
    setDiscMsg("");
    setDiscList([]);
    try {
      const { data, error } = await supabase.functions.invoke("ai-message", {
        body: {
          action: "discover",
          sector: discSector.trim(),
          region: f.region,
          city: f.work_address || undefined,
          radius: f.radius_km,
          lat: f.work_lat || undefined,
          lng: f.work_lng || undefined,
          limit: 12,
        },
      });
      if (error) throw error;
      if (data?.error) {
        setDiscMsg(data.error);
        return;
      }
      const base = (data.negocios || []) as DiscItem[];
      const hasLoc = !!f.work_lat && !!f.work_lng;
      const withD = base
        .map((n) => ({
          ...n,
          _km: typeof n.dist_km === "number"
            ? n.dist_km
            : hasLoc && n.lat != null && n.lng != null
            ? distKm(f.work_lat, f.work_lng, n.lat, n.lng)
            : null,
        }))
        .sort((a, b) => (a._km ?? 1e9) - (b._km ?? 1e9));
      setDiscList(withD);
      setDiscSel([]);
      if (!withD.length) setDiscMsg(data.aviso || `Nada num raio de ${f.radius_km} km. Aumente o raio em Atendimento ou tente outro setor.`);
    } catch (e) {
      setDiscMsg(e instanceof Error ? e.message : "Falha na busca");
    } finally {
      setDiscBusy(false);
    }
  };

  const addDiscoverLead = async (n: DiscItem): Promise<boolean> => {
    if (!user) return false;
    const tag = tagFromSector(discSector);
    const { error } = await supabase.from("leads").insert({
      user_id: user.id,
      nome: n.nome || "Sem nome",
      site: n.site || null,
      telefone: (n.telefone || "").replace(/\D/g, "") || null,
      cidade: n.cidade || null,
      endereco: n.endereco || null,
      lat: n.lat ?? null,
      lng: n.lng ?? null,
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
    let ok = 0;
    for (const n of items) {
      if (await addDiscoverLead(n)) ok++;
    }
    setDiscSel([]);
    onRefresh?.();
    setDiscMsg(`${ok} lead(s) adicionado(s) ao Funil. Abra a aba “Funil” para ver.`);
    setAddBusy(false);
  };

  const usarLocalizacao = async () => {
    const loc = await getCurrentLocation();
    if (!loc) {
      alert("Não consegui pegar sua localização. Confira a permissão do app.");
      return;
    }
    if (!user) return;
    await supabase.from("profiles").update({ work_lat: loc.lat, work_lng: loc.lng } as never).eq("user_id", user.id);
    const addr = await reverseGeocode(loc.lat, loc.lng);
    const rua = [addr?.endereco, addr?.bairro, addr?.cidade].filter(Boolean).join(", ");
    setF((p) => ({ ...p, work_address: rua || p.work_address || "📍 localização salva", work_lat: loc.lat, work_lng: loc.lng }));
    alert(rua ? `Localização salva: ${rua}` : "Localização de atendimento salva!");
  };

  const onDoc = async (file: File) => {
    if (!user) return;
    setDocBusy(true);
    setDocName(file.name);
    try {
      const texto = await extrairTexto(file);
      const ext = file.name.toLowerCase().endsWith(".pdf") ? "pdf" : "docx";
      const path = `${user.id}/${Date.now()}.${ext}`;
      await supabase.storage.from("profile_docs").upload(path, file, { upsert: true, contentType: file.type });
      const { data } = supabase.storage.from("profile_docs").getPublicUrl(path);
      // Destila os diferenciais do currículo (skill) para a IA usar com peso nas abordagens.
      let resumo = "";
      try {
        const { data: rd } = await supabase.functions.invoke("ai-message", { body: { action: "resume", text: texto } });
        if (rd?.summary) resumo = String(rd.summary);
      } catch { /* segue sem resumo */ }
      setF((p) => ({ ...p, resume_text: texto, resume_url: data.publicUrl, resume_summary: resumo }));
      await supabase.from("profiles").update({ resume_text: texto, resume_url: data.publicUrl, resume_summary: resumo } as never).eq("user_id", user.id);
      alert(`Documento lido com sucesso: ${texto.length} caracteres.\n\nExtraí os destaques dele para as abordagens:` + (resumo ? `\n\n${resumo}` : " (não consegui extrair destaques agora)"));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Falha ao ler o documento.");
      setDocName("");
    } finally {
      setDocBusy(false);
      if (docRef.current) docRef.current.value = "";
    }
  };

  const setSocial = (k: string, v: string) => setF((p) => ({ ...p, socials: { ...p.socials, [k]: v } }));

  const enviarLogo = async (file?: File | null) => {
    if (!file || !user) return;
    setLogoBusy(true);
    try {
      const url = await uploadBrandLogo(user.id, file);
      setLogoUrl(url);
      const socials = { ...f.socials, _logo: url, _brand_color: brandColor };
      setF((p) => ({ ...p, socials }));
      await supabase.from("profiles").update({ socials } as never).eq("user_id", user.id);
      onRefresh?.();
    } catch (e) {
      alert("Não consegui enviar o logo: " + (e instanceof Error ? e.message : "erro"));
    } finally {
      setLogoBusy(false);
      if (logoRef.current) logoRef.current.value = "";
    }
  };

  const removerLogo = async () => {
    if (!user) return;
    setLogoUrl(null);
    const socials = { ...f.socials, _logo: "" };
    setF((p) => ({ ...p, socials }));
    await supabase.storage.from("profile_docs").remove([`${user.id}/brand/logo.png`]);
    await supabase.from("profiles").update({ socials } as never).eq("user_id", user.id);
    onRefresh?.();
  };

  const mudarCor = (color: string) => {
    setBrandColor(color);
    setF((p) => ({ ...p, socials: { ...p.socials, _brand_color: color } }));
  };

  const alterarSenha = async () => {
    if (newPwd.length < 6) { alert("A senha precisa ter ao menos 6 caracteres."); return; }
    if (newPwd !== newPwd2) { alert("As senhas não conferem."); return; }
    setPwdBusy(true);
    const { error } = await updatePassword(newPwd);
    setPwdBusy(false);
    if (error) { alert("Não deu para trocar a senha: " + error); return; }
    setNewPwd(""); setNewPwd2("");
    alert("Senha alterada com sucesso!");
  };

  const excluirConta = async () => {
    if (!confirm("Tem certeza? Isso apaga sua conta e TODOS os seus leads. Não dá para desfazer.")) return;
    if (!confirm("Confirme de novo: excluir definitivamente sua conta e seus dados?")) return;
    setDeleting(true);
    try {
      const { error } = await supabase.functions.invoke("delete-account", {});
      if (error) throw error;
      await signOut();
    } catch (e) {
      alert("Não deu para excluir agora: " + (e instanceof Error ? e.message : "erro"));
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-brand-pink" /></div>;

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-24">
      <CollapsibleCard title="Seu perfil de abordagem" subtitle="Quem você é, o que faz e onde atende." storageKey="perfil">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div><span className="label">Seu nome</span><input className="input" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></div>
            <div><span className="label">Nome da empresa</span><input className="input" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} /></div>
          </div>
          <div>
            <span className="label">Seu site</span>
            <input className="input" value={f.site} onChange={(e) => setF({ ...f, site: e.target.value })} onBlur={(e) => setF({ ...f, site: withHttps(e.target.value) })} placeholder="meusite.com.br" />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <span className="label">Sobre o seu negócio (o que você faz / onde atende / como paga)</span>
              <MicInto onText={(t) => setF((p) => ({ ...p, ai_instruction: (p.ai_instruction ? p.ai_instruction + "\n" : "") + t }))} />
            </div>
            <textarea className="input min-h-[120px]" value={f.ai_instruction} onChange={(e) => setF({ ...f, ai_instruction: e.target.value })} />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <span className="label">Perfil profissional (serviços, preços, diferenciais)</span>
              <MicInto onText={(t) => setF((p) => ({ ...p, professional_profile: (p.professional_profile ? p.professional_profile + "\n" : "") + t }))} />
            </div>
            <textarea className="input min-h-[110px]" value={f.professional_profile} onChange={(e) => setF({ ...f, professional_profile: e.target.value })} />
          </div>
        </div>
      </CollapsibleCard>

      <CollapsibleCard title="Redes sociais" subtitle="Informe seus perfis — ajuda a entender quem você é." storageKey="redes">
        <div className="grid grid-cols-2 gap-2">
          {SOCIAL_KEYS.map((s) => (
            <div key={s.k}>
              <span className="label">{s.label}</span>
              <div className="flex gap-1">
                <input
                  className="input"
                  value={f.socials[s.k] || ""}
                  onChange={(e) => setSocial(s.k, e.target.value)}
                  onBlur={(e) => setSocial(s.k, socialUrl(s.k, e.target.value))}
                  placeholder={s.k === "whatsapp" ? "(48) 99999-9999" : `@seu${s.k}`}
                />
                {f.socials[s.k] && (
                  <button
                    type="button"
                    className="btn-ghost shrink-0 !px-2"
                    title="Copiar link"
                    onClick={() => {
                      const link = socialUrl(s.k, f.socials[s.k]);
                      setSocial(s.k, link);
                      navigator.clipboard.writeText(link);
                      alert("Link copiado:\n" + link);
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </CollapsibleCard>

      <CollapsibleCard title="Marca das propostas" subtitle="Logo e cor usados no PDF profissional." storageKey="marca">
        <div className="flex items-center gap-3 rounded-xl border border-brand-purple/15 bg-white/60 p-3">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-brand-purple/15 bg-white">
            {logoUrl ? <img src={logoUrl} alt="Logo" className="h-full w-full object-contain" /> : <ImageIcon className="h-6 w-6 text-brand-purple/40" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-brand-deep">{f.company || f.nome || "Sua marca"}</p>
            <p className="truncate text-[11px] text-brand-ink/50">{f.site || "Informe seu site acima"}</p>
            <p className="mt-1 text-[11px] text-brand-ink/50">Aparece no cabeçalho, no rodapé e na assinatura da proposta.</p>
          </div>
        </div>
        <input ref={logoRef} type="file" accept="image/*" hidden onChange={(e) => void enviarLogo(e.target.files?.[0])} />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className="btn-ghost !px-3 !py-2 !text-xs" onClick={() => logoRef.current?.click()} disabled={logoBusy}>
            {logoBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />} {logoBusy ? "Enviando..." : "Enviar logo"}
          </button>
          {logoUrl && (
            <button className="btn-ghost !px-3 !py-2 !text-xs !text-red-600" onClick={() => void removerLogo()}>
              <Trash2 className="h-3.5 w-3.5" /> Remover
            </button>
          )}
          <label className="flex items-center gap-2 rounded-full border border-brand-purple/20 px-3 py-2 text-xs font-bold text-brand-deep">
            Cor da marca
            <input type="color" value={brandColor} onChange={(e) => mudarCor(e.target.value)} className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0" />
          </label>
        </div>
      </CollapsibleCard>

      <CollapsibleCard title="Currículo / portfólio" subtitle="Anexe um PDF ou DOCX (entra no contexto)." storageKey="curriculo">
        <input ref={docRef} type="file" accept=".pdf,.docx" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) void onDoc(file); }} />
        <button className="btn-ghost w-full" onClick={() => docRef.current?.click()} disabled={docBusy}>
          {docBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />} {docBusy ? "Lendo..." : "Anexar documento (PDF/DOCX)"}
        </button>
        {f.resume_text ? (
          <div className="mt-3 rounded-xl border border-brand-money/40 bg-brand-money/5 p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-brand-deep">
                ✓ Documento lido: {f.resume_text.length} caracteres (usado nas abordagens)
              </span>
              <button onClick={() => { setF((p) => ({ ...p, resume_text: "", resume_url: "" })); setDocName(""); }} className="rounded-full p-1 hover:bg-black/5"><X className="h-3 w-3" /></button>
            </div>
            <p className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap text-[11px] text-brand-ink/70">
              {f.resume_text.slice(0, 400)}{f.resume_text.length > 400 ? "…" : ""}
            </p>
          </div>
        ) : docName ? (
          <p className="mt-2 text-[11px] text-brand-ink/60">{docName}</p>
        ) : null}
      </CollapsibleCard>

      <CollapsibleCard title="Mensagens" subtitle="Mensagem fixa e a “Pesquisa” (follow-up do dia seguinte)." storageKey="mensagens">
        <div className="space-y-3">
          <div>
            <span className="label">Mensagem fixa (inicial)</span>
            <textarea className="input min-h-[90px]" value={f.fixed_message} onChange={(e) => setF({ ...f, fixed_message: e.target.value })} placeholder="Use {saudacao}, {estabelecimento} e {site}." />
          </div>
          <div>
            <span className="label">Mensagem “Pesquisa” (follow-up D+1)</span>
            <textarea className="input min-h-[150px]" value={f.followup_message} onChange={(e) => setF({ ...f, followup_message: e.target.value })} />
          </div>
        </div>
      </CollapsibleCard>

      <CollapsibleCard title="Conhecer meu perfil" subtitle="Pesquisa na web e entrevista — para o app aprender sobre você." storageKey="conhecer">
        <label className="flex items-start gap-2 text-[11px] text-brand-ink/70">
          <input type="checkbox" checked={researchConsent} onChange={(e) => setResearchConsent(e.target.checked)} className="mt-0.5" />
          Autorizo a busca de informações públicas sobre meu perfil (meu site/redes), conforme a Política de Privacidade (LGPD).
        </label>
        <button className="btn-primary mt-3 w-full" onClick={pesquisar} disabled={researching || !researchConsent}>
          {researching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Pesquisar meu perfil
        </button>
        {researchDraft && (
          <div className="mt-3 space-y-2">
            <span className="label">Perfil sugerido (revise e edite)</span>
            <textarea className="input min-h-[140px]" value={researchDraft} onChange={(e) => setResearchDraft(e.target.value)} />
            <button className="btn-ghost w-full" onClick={() => setF((p) => ({ ...p, professional_profile: researchDraft }))}>Usar este perfil</button>
          </div>
        )}
        {researchQs.length > 0 && (
          <div className="mt-3 space-y-2">
            <span className="label">Perguntas para completar</span>
            <ul className="list-disc pl-5 text-[11px] text-brand-ink/70">
              {researchQs.map((q, i) => <li key={i}>{q}</li>)}
            </ul>
            <div className="flex items-center justify-between">
              <span className="label">Sua resposta</span>
              <MicInto onText={(t) => setAnswers((p) => (p ? p + " " + t : t))} />
            </div>
            <textarea className="input min-h-[90px]" value={answers} onChange={(e) => setAnswers(e.target.value)} placeholder="Responda aqui para enriquecer seu perfil..." />
            <button
              className="btn-ghost w-full"
              onClick={() => {
                setF((p) => ({ ...p, ai_instruction: (p.ai_instruction ? p.ai_instruction + "\n" : "") + answers }));
                setAnswers("");
                alert("Respostas adicionadas às suas informações.");
              }}
            >
              Adicionar respostas
            </button>
          </div>
        )}

        <div className="mt-4 space-y-2 border-t border-brand-purple/15 pt-3">
          <h3 className="text-base font-extrabold text-brand-deep">Entrevista (responda por texto ou voz 🎤)</h3>
          <p className="text-[11px] text-brand-ink/60">
            Umas poucas perguntas objetivas e o app monta o seu perfil para prospectar por você (porta a porta e WhatsApp a WhatsApp).
          </p>

          {interviewLog.length === 0 && !interviewQ && (
            <button className="btn-primary w-full" onClick={iniciarEntrevista} disabled={interviewing}>
              {interviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />} Iniciar entrevista
            </button>
          )}

          {interviewLog.length > 0 && (
            <div className="space-y-2">
              {interviewLog.map((h, i) => (
                <div key={i} className="space-y-1">
                  <p className="text-[12px] font-bold text-brand-deep">{h.q}</p>
                  <p className="rounded-lg bg-brand-pink/10 px-3 py-1.5 text-[12px] text-brand-ink/80">{h.a}</p>
                </div>
              ))}
            </div>
          )}

          {interviewQ && !interviewDone && (
            <div className="space-y-2 rounded-xl border border-brand-purple/20 bg-white/60 p-3">
              <p className="text-[13px] font-bold text-brand-deep">{interviewQ}</p>
              <div className="flex items-center justify-between">
                <span className="label">Sua resposta</span>
                <MicInto onText={(t) => setInterviewA((p) => (p ? p + " " + t : t))} />
              </div>
              <textarea className="input min-h-[80px]" value={interviewA} onChange={(e) => setInterviewA(e.target.value)} placeholder="Digite ou dite sua resposta..." />
              <button className="btn-primary w-full" onClick={responderEntrevista} disabled={interviewing || !interviewA.trim()}>
                {interviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar resposta
              </button>
            </div>
          )}

          {interviewDone && (
            <div className="rounded-xl border border-brand-money/40 bg-brand-money/5 p-3">
              <p className="text-[12px] font-bold text-brand-deep">Perfil montado:</p>
              <p className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap text-[11px] text-brand-ink/70">{interviewPerfil}</p>
              <div className="mt-2 flex gap-2">
                <button className="btn-primary flex-1" onClick={() => { setF((p) => ({ ...p, professional_profile: interviewPerfil })); alert("Perfil aplicado!"); }}>Aplicar ao meu perfil</button>
                <button className="btn-ghost" onClick={iniciarEntrevista} disabled={interviewing}>Recomeçar</button>
              </div>
            </div>
          )}
        </div>
      </CollapsibleCard>

      <CollapsibleCard title="Elaboração de mensagens" subtitle="IA do app e consumo de Doods." storageKey="elaboracao">
        <p className="text-[12px] leading-snug text-brand-ink/70">
          As mensagens são geradas pela <b>IA do app</b>, gerenciada automaticamente — você não precisa configurar nada.
          Cada elaboração consome <b>Doods</b>. Veja o saldo e recarregue na aba <b>Dood's</b>.
        </p>
      </CollapsibleCard>

      <CollapsibleCard title="Conta e segurança" subtitle="Alterar a senha de acesso." storageKey="conta">
        <div className="space-y-3">
          <div><span className="label">Nova senha</span><input className="input" type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} placeholder="mínimo 6 caracteres" /></div>
          <div><span className="label">Confirmar nova senha</span><input className="input" type="password" value={newPwd2} onChange={(e) => setNewPwd2(e.target.value)} /></div>
          <button className="btn-primary w-full" onClick={alterarSenha} disabled={pwdBusy}>
            {pwdBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Alterar senha
          </button>
        </div>
      </CollapsibleCard>

      <button className="btn-primary w-full" onClick={salvar} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {saved ? "Atualizado!" : "Atualizar"}
      </button>

      <div className="mt-6 rounded-2xl border border-red-200 bg-red-50/60 p-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-red-600">Zona de perigo</p>
        <p className="mt-1 text-[11px] text-brand-ink/60">Exclui permanentemente sua conta, seus leads, mensagens e arquivos.</p>
        <button className="btn-ghost mt-3 w-full !text-red-600" onClick={excluirConta} disabled={deleting}>
          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} Excluir minha conta
        </button>
      </div>
    </div>
  );
}
