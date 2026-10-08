import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { getCurrentLocation, reverseGeocode } from "@/lib/geo";
import { socialUrl } from "@/lib/format";
import { Loader2, Save, Paperclip, MapPin, X, Mic, Square, Sparkles, Copy, Send } from "lucide-react";

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

export default function ProfilePage() {
  const { user } = useAuth();
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
  const [docBusy, setDocBusy] = useState(false);
  const [docName, setDocName] = useState("");
  const docRef = useRef<HTMLInputElement>(null);
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
    resume_text: "",
    resume_url: "",
    socials: {} as Record<string, string>,
  });

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
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
            resume_text: data.resume_text || "",
            resume_url: data.resume_url || "",
            socials: (data.socials as Record<string, string>) || {},
          });
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
        ai_provider: f.ai_provider,
        ai_api_key: f.ai_api_key,
        ai_keys: f.ai_keys,
      } as never, { onConflict: "user_id" });
    }, 1500);
    return () => window.clearTimeout(t);
  }, [f.ai_instruction, f.professional_profile, f.fixed_message, f.followup_message, f.socials, f.site, f.work_address, f.radius_km, f.ai_provider, f.ai_api_key, f.ai_keys]);

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
    setF((p) => ({ ...p, work_address: rua || p.work_address || "📍 localização salva" }));
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
      setF((p) => ({ ...p, resume_text: texto, resume_url: data.publicUrl }));
      alert(`Documento lido com sucesso: ${texto.length} caracteres.\n\nEsse texto passa a ser usado nas abordagens (aparece na prévia abaixo).`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Falha ao ler o documento.");
      setDocName("");
    } finally {
      setDocBusy(false);
      if (docRef.current) docRef.current.value = "";
    }
  };

  const setSocial = (k: string, v: string) => setF((p) => ({ ...p, socials: { ...p.socials, [k]: v } }));

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-brand-pink" /></div>;

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-24">
      <div className="card p-5">
        <h2 className="text-lg font-extrabold text-brand-deep">Seu perfil de abordagem</h2>
        <p className="mb-3 text-xs text-brand-ink/60">
          Quanto mais o app souber sobre você, melhores as abordagens: quem você é, o que faz, onde atende, como paga, diferenciais...
        </p>
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
      </div>

      <div className="card p-5">
        <h2 className="text-lg font-extrabold text-brand-deep">Redes sociais</h2>
        <p className="mb-3 text-xs text-brand-ink/60">Informe seus perfis (isso ajuda a entender exatamente quem você é).</p>
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
      </div>

      <div className="card p-5">
        <h2 className="text-lg font-extrabold text-brand-deep">Atendimento</h2>
        <p className="mb-3 text-xs text-brand-ink/60">Onde você atende e até quantos km se desloca.</p>
        <div className="space-y-3">
          <div>
            <span className="label">Endereço de trabalho</span>
            <div className="flex gap-2">
              <input className="input" value={f.work_address} onChange={(e) => setF({ ...f, work_address: e.target.value })} placeholder="Rua, cidade" />
              <button className="btn-ghost shrink-0 !px-3" onClick={usarLocalizacao} title="Usar minha localização">
                <MapPin className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div>
            <span className="label">Raio de atendimento: {f.radius_km} km</span>
            <input type="range" min={1} max={100} value={f.radius_km} onChange={(e) => setF({ ...f, radius_km: Number(e.target.value) })} className="w-full accent-brand-pink" />
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="text-lg font-extrabold text-brand-deep">Currículo / portfólio</h2>
        <p className="mb-3 text-xs text-brand-ink/60">Anexe um <b>PDF ou DOCX</b>. O texto entra no contexto das abordagens.</p>
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
      </div>

      <div className="card p-5">
        <h2 className="text-lg font-extrabold text-brand-deep">Mensagens</h2>
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
      </div>

      <div className="card p-5">
        <h2 className="text-lg font-extrabold text-brand-deep">Conhecer meu perfil</h2>
        <p className="mb-2 text-xs text-brand-ink/60">O app lê o seu site/redes públicas para montar o seu perfil e sugerir o que falta.</p>
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
      </div>

      <div className="card p-5">
        <h2 className="text-lg font-extrabold text-brand-deep">Elaboração de mensagens</h2>
        <div className="space-y-3">
          <div>
            <span className="label">Provedor</span>
            <select
              className="input"
              value={f.ai_provider}
              onChange={(e) => {
                const p = e.target.value;
                setF((prev) => ({ ...prev, ai_provider: p, ai_api_key: prev.ai_keys[p] || "" }));
              }}
            >
              {PROVIDERS.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}
            </select>
          </div>
          {f.ai_provider !== "default" && (
            <div>
              <span className="label">Sua API key ({f.ai_provider}) — cada provedor guarda a sua</span>
              <input
                className="input"
                value={f.ai_api_key}
                onChange={(e) => setF((prev) => ({ ...prev, ai_api_key: e.target.value, ai_keys: { ...prev.ai_keys, [prev.ai_provider]: e.target.value } }))}
                placeholder="cole sua chave"
              />
            </div>
          )}
          <button type="button" className="btn-ghost w-full" onClick={testarIA} disabled={testing}>
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Testar conexão
          </button>
          {testMsg && <p className="text-[11px] font-medium text-brand-ink/80">{testMsg}</p>}
        </div>
      </div>

      <button className="btn-primary w-full" onClick={salvar} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {saved ? "Atualizado!" : "Atualizar"}
      </button>
    </div>
  );
}
