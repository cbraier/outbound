import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { chargeDood, getWallet, priceOf, type DoodPrice } from "@/lib/dood";
import { findBrandLogo, uploadBrandLogo } from "@/lib/brand";
import {
  deleteProposal,
  formatBRLRange,
  generateProposal,
  loadProposals,
  proposalBrandFromProfile,
  saveProposal,
} from "@/lib/proposals";
import { downloadOrSharePdf } from "@/lib/proposal-pdf";
import CommerceAuditCard from "@/components/CommerceAuditCard";
import { auditToProposalContext, type AuditResult } from "@/lib/commercePilot";
import {
  DEFAULT_BRAND_COLOR,
  PROPOSAL_TYPE_LABELS,
  type ProposalType,
  type SavedProposal,
} from "@/lib/proposal-types";
import {
  FileText,
  Sparkles,
  Loader2,
  Upload,
  X,
  Plus,
  Trash2,
  Download,
  Save,
  Coins,
  CheckCircle2,
  ArrowLeft,
  Image as ImageIcon,
  Clock,
  Wallet,
} from "lucide-react";

type Profile = {
  nome: string | null;
  company?: string | null;
  site: string | null;
  socials?: Record<string, string> | null;
  ai_provider: string | null;
  ai_api_key: string | null;
};

const TYPES: ProposalType[] = ["site", "app", "sistema", "site_app"];

async function fileToCompressedB64(file: File): Promise<string> {
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
    const max = 1280;
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl.split(",")[1] || "";
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return (canvas.toDataURL("image/jpeg", 0.78).split(",")[1] || "");
  } catch {
    return dataUrl.split(",")[1] || "";
  }
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `p_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}

function lines(v: string): string[] {
  return v.split("\n").map((x) => x.trim()).filter(Boolean);
}

function linesText(v: string[]): string {
  return (v || []).join("\n");
}

export default function ProposalPage({
  userId,
  profile,
  onGoToDoods,
  onRefresh,
}: {
  userId: string;
  profile: Profile | null;
  onGoToDoods?: () => void;
  onRefresh?: () => void;
}) {
  const [conversation, setConversation] = useState("");
  const [images, setImages] = useState<{ name: string; b64: string }[]>([]);
  const [projectType, setProjectType] = useState<ProposalType>("site");
  const [notes, setNotes] = useState("");
  const [auditSite, setAuditSite] = useState("");
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [includeAudit, setIncludeAudit] = useState(true);
  const [draft, setDraft] = useState<SavedProposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [proposals, setProposals] = useState<SavedProposal[]>([]);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [brandColor, setBrandColor] = useState(DEFAULT_BRAND_COLOR);
  const [pricing, setPricing] = useState<DoodPrice[]>([]);
  const [balance, setBalance] = useState<number>(0);
  const [logoBusy, setLogoBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  const cost = priceOf(pricing, "proposal_analyze");
  const canPay = pricing.length === 0 || balance >= cost;

  useEffect(() => {
    let alive = true;
    (async () => {
      const [w, ps, logo] = await Promise.all([getWallet(true), loadProposals(userId), findBrandLogo(userId)]);
      if (!alive) return;
      setBalance(w.balance);
      setPricing(w.pricing);
      setProposals(ps);
      const cached = profile?.socials?._logo || null;
      setLogoUrl(cached || logo);
      setBrandColor(profile?.socials?._brand_color || DEFAULT_BRAND_COLOR);
    })();
    return () => {
      alive = false;
    };
  }, [userId, profile?.socials?._logo, profile?.socials?._brand_color]);

  const brand = useMemo(
    () => proposalBrandFromProfile(profile || { nome: "", company: "", site: "", socials: {} }, logoUrl),
    [profile, logoUrl],
  );

  const setClient = (patch: Partial<SavedProposal["cliente"]>) =>
    setDraft((d) => (d ? { ...d, cliente: { ...d.cliente, ...patch } } : d));
  const setInvest = (patch: Partial<SavedProposal["investimento"]>) =>
    setDraft((d) => (d ? { ...d, investimento: { ...d.investimento, ...patch } } : d));
  const setPrazo = (patch: Partial<SavedProposal["prazo"]>) =>
    setDraft((d) => (d ? { ...d, prazo: { ...d.prazo, ...patch } } : d));
  const setScope = (i: number, patch: Partial<SavedProposal["escopo"][number]>) =>
    setDraft((d) => (d ? { ...d, escopo: d.escopo.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) } : d));
  const setStep = (i: number, patch: Partial<SavedProposal["prazo"]["etapas"][number]>) =>
    setDraft((d) => (d ? { ...d, prazo: { ...d.prazo, etapas: d.prazo.etapas.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) } } : d));

  const uploadImages = async (files: FileList | null) => {
    if (!files?.length) return;
    const next: { name: string; b64: string }[] = [];
    for (const file of Array.from(files).slice(0, Math.max(0, 3 - images.length))) {
      if (!file.type.startsWith("image/")) continue;
      next.push({ name: file.name, b64: await fileToCompressedB64(file) });
    }
    setImages((p) => [...p, ...next].slice(0, 3));
    if (fileRef.current) fileRef.current.value = "";
  };

  const uploadLogo = async (file?: File | null) => {
    if (!file) return;
    setLogoBusy(true);
    try {
      const url = await uploadBrandLogo(userId, file);
      setLogoUrl(url);
      const socials = { ...(profile?.socials || {}), _logo: url, _brand_color: brandColor };
      await supabase.from("profiles").update({ socials } as never).eq("user_id", userId);
      setInfo("Logo atualizado. Ele será usado nas próximas propostas.");
      onRefresh?.();
    } catch (e) {
      alert("Não consegui enviar o logo: " + (e instanceof Error ? e.message : "erro"));
    } finally {
      setLogoBusy(false);
      if (logoRef.current) logoRef.current.value = "";
    }
  };

  const salvarMarca = async (color: string) => {
    setBrandColor(color);
    const socials = { ...(profile?.socials || {}), _logo: logoUrl || undefined, _brand_color: color };
    await supabase.from("profiles").update({ socials } as never).eq("user_id", userId);
  };

  const gerar = async () => {
    if (!conversation.trim() && images.length === 0) {
      setErr("Cole a conversa do WhatsApp ou envie pelo menos um print.");
      return;
    }
    setErr("");
    setInfo("");
    if (!canPay) {
      setErr("Você está sem Doods para gerar a proposta.");
      return;
    }
    setBusy(true);
    try {
      const ch = await chargeDood("proposal_analyze");
      if (!ch.ok) {
        setBalance(ch.balance);
        if (ch.message === "unknown_action") setErr("A ação de proposta ainda não está configurada no servidor.");
        else setErr("Sem Doods suficientes. Recarregue na aba Dood's.");
        return;
      }
      setBalance(ch.balance);
      const auditContext = audit && includeAudit ? auditToProposalContext(audit) : "";
      const proposalNotes = [auditContext, notes].filter(Boolean).join("\n\n").slice(0, 2000);
      const generated = await generateProposal({
        conversation,
        images: images.map((i) => i.b64),
        projectType,
        notes: proposalNotes,
        brand,
        provider: profile?.ai_provider,
        apiKey: profile?.ai_api_key,
      });
      const now = new Date().toISOString();
      const saved: SavedProposal = {
        ...generated,
        id: newId(),
        created_at: now,
        updated_at: now,
        status: "rascunho",
        conversa: conversation.slice(0, 24000),
        marca: { ...brand, logo_url: logoUrl || brand.logo_url, cor: brandColor },
      };
      setDraft(saved);
      setInfo(
        audit && includeAudit
          ? "Proposta gerada com os ajustes da auditoria. Revise o escopo, o prazo e o investimento antes do PDF."
          : "Proposta gerada. Revise o escopo, o prazo e o investimento antes de gerar o PDF.",
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao gerar a proposta.");
    } finally {
      setBusy(false);
    }
  };

  const salvar = async (pdf?: boolean) => {
    if (!draft) return;
    if (pdf) setPdfBusy(true);
    else setBusy(true);
    setErr("");
    try {
      let blob: Blob | undefined;
      if (pdf) {
        const out = await downloadOrSharePdf({ ...draft, marca: { ...draft.marca, logo_url: logoUrl || undefined, cor: brandColor } });
        blob = out.blob;
      }
      const final = await saveProposal(userId, { ...draft, status: pdf ? "pronta" : draft.status, marca: { ...draft.marca, logo_url: logoUrl || undefined, cor: brandColor } }, blob);
      setDraft(final);
      setProposals((p) => [final, ...p.filter((x) => x.id !== final.id)]);
      setInfo(pdf ? "PDF gerado e proposta salva. Use o botão para abrir ou compartilhar." : "Proposta salva.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setPdfBusy(false);
      setBusy(false);
    }
  };

  const novaProposta = () => {
    setDraft(null);
    setAudit(null);
    setAuditSite("");
    setIncludeAudit(true);
    setErr("");
    setInfo("");
  };

  const abrir = (p: SavedProposal) => {
    setDraft(p);
    setLogoUrl(p.marca.logo_url || logoUrl);
    setBrandColor(p.marca.cor || DEFAULT_BRAND_COLOR);
    setInfo("");
    setErr("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const excluir = async (p: SavedProposal) => {
    if (!confirm(`Excluir a proposta de “${p.cliente.empresa || p.cliente.nome || "cliente"}”?`)) return;
    await deleteProposal(userId, p);
    setProposals((list) => list.filter((x) => x.id !== p.id));
    if (draft?.id === p.id) setDraft(null);
  };

  const abrirPdf = async (p: SavedProposal) => {
    if (p.pdf_url) {
      window.open(p.pdf_url, "_blank", "noopener,noreferrer");
      return;
    }
    setPdfBusy(true);
    try {
      const out = await downloadOrSharePdf({ ...p, marca: { ...p.marca, logo_url: logoUrl || p.marca.logo_url, cor: p.marca.cor || brandColor } });
      const saved = await saveProposal(userId, p, out.blob);
      setProposals((list) => list.map((x) => (x.id === saved.id ? saved : x)));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Falha ao gerar o PDF.");
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-24">
      <div className="card overflow-hidden p-0">
        <div className="bg-gradient-to-br from-brand-purple via-brand-magenta to-brand-pink px-5 py-5 text-white">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-white/75">
            <FileText className="h-4 w-4" /> Propostas com IA
          </div>
          <h2 className="mt-1 text-2xl font-black leading-tight">Da conversa ao PDF em minutos</h2>
          <p className="mt-1 text-sm font-medium text-white/85">
            Cole a conversa do WhatsApp ou envie prints. A IA monta o escopo, estima o prazo e gera uma proposta profissional com a sua marca.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold">
            <span className="rounded-full bg-white/15 px-3 py-1">1 Dood = R$ 0,01</span>
            <span className="rounded-full bg-white/15 px-3 py-1">
              Geração: {cost ? `${cost} Doods` : "10 Doods"} · saldo {balance.toLocaleString("pt-BR")}
            </span>
          </div>
        </div>
      </div>

      {!draft && (
        <>
          <CommerceAuditCard
            url={auditSite}
            onUrlChange={setAuditSite}
            audit={audit}
            onAudit={setAudit}
            included={includeAudit}
            onIncludedChange={setIncludeAudit}
          />

          <div className="card space-y-4 p-5">
            <div>
              <span className="label">O que você está propondo?</span>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => setProjectType(t)}
                    className={`rounded-xl px-3 py-2.5 text-left text-xs font-bold ${projectType === t ? "bg-gradient-to-br from-brand-pink to-brand-purple text-white" : "border border-brand-purple/20 text-brand-deep"}`}
                  >
                    {PROPOSAL_TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <span className="label">Conversa do WhatsApp</span>
                <span className="text-[10px] font-semibold text-brand-ink/40">{conversation.length.toLocaleString("pt-BR")} caracteres</span>
              </div>
              <textarea
                className="input mt-1 min-h-[220px] text-xs leading-relaxed"
                value={conversation}
                onChange={(e) => setConversation(e.target.value)}
                placeholder={"Cole aqui a conversa com o cliente.\n\nExemplo:\nCliente: preciso de um site para minha clínica, com agendamento e WhatsApp.\nEu: você quer também um app?\nCliente: por enquanto só o site, mas quero aparecer no Google. Meu prazo é até dezembro."}
              />
              <p className="mt-1 text-[11px] text-brand-ink/50">Funciona com texto colado ou prints da conversa. Nada é enviado sem você tocar em gerar.</p>
            </div>

            <div>
              <span className="label">Prints da conversa (até 3)</span>
              <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void uploadImages(e.target.files)} />
              <button className="btn-ghost mt-2 w-full !py-2 !text-xs" onClick={() => fileRef.current?.click()} disabled={images.length >= 3}>
                <ImageIcon className="h-3.5 w-3.5" /> Enviar print do WhatsApp
              </button>
              {images.length > 0 && (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {images.map((img, i) => (
                    <div key={i} className="relative overflow-hidden rounded-xl border border-brand-purple/15">
                      <img src={`data:image/jpeg;base64,${img.b64}`} alt="" className="h-20 w-full object-cover" />
                      <button
                        className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
                        onClick={() => setImages((p) => p.filter((_, idx) => idx !== i))}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <span className="label">Observações (opcional)</span>
              <input
                className="input mt-1"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex.: cliente quer pagar em 3x; já tem logo; precisa de blog."
              />
            </div>

            {err && <p className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-600">{err}</p>}
            {!canPay && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
                Saldo insuficiente para gerar a proposta. Recarregue seus Doods para continuar.
                {onGoToDoods && (
                  <button className="mt-2 block font-bold underline" onClick={onGoToDoods}>
                    Ir para Dood's
                  </button>
                )}
              </div>
            )}

            <button className="btn-primary w-full" onClick={gerar} disabled={busy || !canPay}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {busy ? "Lendo a conversa e montando..." : `Gerar proposta com IA${cost ? ` · ${cost} Doods` : ""}`}
            </button>
            {busy && (
              <div className="flex flex-col items-center gap-2">
                <div className="gemini-bar w-48" />
                <p className="gemini-text text-[11px] font-semibold">Entendendo o pedido, o escopo e o prazo...</p>
              </div>
            )}
          </div>
        </>
      )}

      {draft && (
        <>
          <div className="flex items-center justify-between">
            <button className="btn-ghost !px-3 !py-1.5 !text-xs" onClick={novaProposta}>
              <ArrowLeft className="h-3.5 w-3.5" /> Nova proposta
            </button>
            <span className="rounded-full bg-brand-purple/10 px-3 py-1 text-[11px] font-bold text-brand-deep">
              {draft.status === "pronta" ? "Pronta" : "Rascunho"}
            </span>
          </div>

          <div className="card space-y-3 p-5">
            <div className="flex items-center justify-between gap-2">
              <span className="label">Sua marca</span>
              <span className="text-[10px] text-brand-ink/40">{profile?.company || profile?.nome || "Configure no Perfil"}</span>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-brand-purple/15 bg-white/60 p-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-brand-purple/15 bg-white">
                {logoUrl ? <img src={logoUrl} alt="Logo" className="h-full w-full object-contain" /> : <FileText className="h-6 w-6 text-brand-purple/40" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-brand-deep">{profile?.company || profile?.nome || "Sua empresa"}</p>
                <p className="truncate text-[11px] text-brand-ink/50">{profile?.site || "Sem site no perfil"}</p>
                <div className="mt-1 flex items-center gap-2">
                  <input ref={logoRef} type="file" accept="image/*" hidden onChange={(e) => void uploadLogo(e.target.files?.[0])} />
                  <button className="text-[11px] font-bold text-brand-purple" onClick={() => logoRef.current?.click()} disabled={logoBusy}>
                    {logoBusy ? "Enviando..." : "Trocar logo"}
                  </button>
                  <label className="flex items-center gap-1 text-[11px] font-semibold text-brand-ink/60">
                    Cor
                    <input
                      type="color"
                      value={brandColor}
                      onChange={(e) => void salvarMarca(e.target.value)}
                      className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div className="card space-y-3 p-5">
            <span className="label">Cliente</span>
            <div className="grid grid-cols-2 gap-2">
              <div><span className="label">Empresa</span><input className="input mt-1" value={draft.cliente.empresa} onChange={(e) => setClient({ empresa: e.target.value })} /></div>
              <div><span className="label">Contato</span><input className="input mt-1" value={draft.cliente.nome} onChange={(e) => setClient({ nome: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><span className="label">Telefone / e-mail</span><input className="input mt-1" value={draft.cliente.contato} onChange={(e) => setClient({ contato: e.target.value })} /></div>
              <div><span className="label">Segmento</span><input className="input mt-1" value={draft.cliente.segmento} onChange={(e) => setClient({ segmento: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><span className="label">Cidade</span><input className="input mt-1" value={draft.cliente.cidade || ""} onChange={(e) => setClient({ cidade: e.target.value })} /></div>
              <div>
                <span className="label">Tipo</span>
                <select className="input mt-1" value={draft.tipo} onChange={(e) => setDraft({ ...draft, tipo: e.target.value as ProposalType })}>
                  {TYPES.map((t) => <option key={t} value={t}>{PROPOSAL_TYPE_LABELS[t]}</option>)}
                </select>
              </div>
            </div>
            <div><span className="label">Título da proposta</span><input className="input mt-1" value={draft.titulo} onChange={(e) => setDraft({ ...draft, titulo: e.target.value })} /></div>
            <div><span className="label">Resumo</span><textarea className="input mt-1 min-h-[90px]" value={draft.resumo} onChange={(e) => setDraft({ ...draft, resumo: e.target.value })} /></div>
          </div>

          <div className="card space-y-3 p-5">
            <div className="flex items-center justify-between">
              <span className="label">Escopo do projeto</span>
              <button
                className="btn-ghost !px-2 !py-1 !text-[11px]"
                onClick={() => setDraft({ ...draft, escopo: [...draft.escopo, { titulo: "Nova etapa", descricao: "", itens: [] }] })}
              >
                <Plus className="h-3 w-3" /> Etapa
              </button>
            </div>
            {draft.escopo.map((s, i) => (
              <div key={i} className="space-y-2 rounded-xl border border-brand-purple/15 bg-white/60 p-3">
                <div className="flex items-center gap-2">
                  <input className="input !py-2 font-bold" value={s.titulo} onChange={(e) => setScope(i, { titulo: e.target.value })} />
                  <button className="rounded-full p-2 text-red-400 hover:bg-red-50" onClick={() => setDraft({ ...draft, escopo: draft.escopo.filter((_, idx) => idx !== i) })}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <textarea className="input min-h-[60px]" value={s.descricao} onChange={(e) => setScope(i, { descricao: e.target.value })} placeholder="Descrição da etapa" />
                <textarea className="input min-h-[70px] text-xs" value={linesText(s.itens)} onChange={(e) => setScope(i, { itens: lines(e.target.value) })} placeholder="Um item por linha" />
              </div>
            ))}
          </div>

          <div className="card space-y-3 p-5">
            <span className="label">Entregáveis e limites</span>
            <div><span className="label">O que está incluído (um por linha)</span><textarea className="input mt-1 min-h-[90px] text-xs" value={linesText(draft.entregaveis)} onChange={(e) => setDraft({ ...draft, entregaveis: lines(e.target.value) })} /></div>
            <div><span className="label">Premissas (uma por linha)</span><textarea className="input mt-1 min-h-[70px] text-xs" value={linesText(draft.premissas)} onChange={(e) => setDraft({ ...draft, premissas: lines(e.target.value) })} /></div>
            <div><span className="label">Não está incluído (um por linha)</span><textarea className="input mt-1 min-h-[70px] text-xs" value={linesText(draft.nao_inclui)} onChange={(e) => setDraft({ ...draft, nao_inclui: lines(e.target.value) })} /></div>
          </div>

          <div className="card space-y-3 p-5">
            <span className="label">Prazo e investimento</span>
            <div className="grid grid-cols-3 gap-2">
              <div><span className="label">Semanas (mín.)</span><input className="input mt-1" type="number" min={0} value={draft.prazo.semanas_min} onChange={(e) => setPrazo({ semanas_min: Number(e.target.value) || 0 })} /></div>
              <div><span className="label">Semanas (máx.)</span><input className="input mt-1" type="number" min={0} value={draft.prazo.semanas_max} onChange={(e) => setPrazo({ semanas_max: Number(e.target.value) || 0 })} /></div>
              <div><span className="label">Texto do prazo</span><input className="input mt-1" value={draft.prazo.texto} onChange={(e) => setPrazo({ texto: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div><span className="label">Valor mín. (R$)</span><input className="input mt-1" type="number" min={0} value={draft.investimento.min} onChange={(e) => setInvest({ min: Number(e.target.value) || 0 })} /></div>
              <div><span className="label">Valor máx. (R$)</span><input className="input mt-1" type="number" min={0} value={draft.investimento.max} onChange={(e) => setInvest({ max: Number(e.target.value) || 0 })} /></div>
              <div><span className="label">Validade (dias)</span><input className="input mt-1" type="number" min={1} value={draft.investimento.validade_dias} onChange={(e) => setInvest({ validade_dias: Number(e.target.value) || 15 })} /></div>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-brand-purple/15 bg-white/60 p-3 text-sm">
              <span className="font-bold text-brand-deep">{draft.investimento.texto || formatBRLRange(draft.investimento.min, draft.investimento.max) || "A definir"}</span>
              <Wallet className="h-4 w-4 text-brand-purple" />
            </div>
            <div><span className="label">Texto do investimento</span><input className="input mt-1" value={draft.investimento.texto} onChange={(e) => setInvest({ texto: e.target.value })} placeholder="R$ 5.000 a R$ 8.000" /></div>
            <div><span className="label">Condições / observações</span><input className="input mt-1" value={draft.investimento.observacao} onChange={(e) => setInvest({ observacao: e.target.value })} /></div>
            <div><span className="label">Forma de pagamento</span><input className="input mt-1" value={draft.investimento.forma_pagamento} onChange={(e) => setInvest({ forma_pagamento: e.target.value })} /></div>

            <div className="flex items-center justify-between pt-1">
              <span className="label">Cronograma sugerido</span>
              <button className="btn-ghost !px-2 !py-1 !text-[11px]" onClick={() => setPrazo({ etapas: [...draft.prazo.etapas, { nome: "", duracao: "", entregaveis: "" }] })}>
                <Plus className="h-3 w-3" /> Etapa
              </button>
            </div>
            {draft.prazo.etapas.map((s, i) => (
              <div key={i} className="grid grid-cols-[1fr_70px_1fr_30px] items-center gap-2">
                <input className="input !py-1.5 text-xs" placeholder="Etapa" value={s.nome} onChange={(e) => setStep(i, { nome: e.target.value })} />
                <input className="input !py-1.5 text-xs" placeholder="Duração" value={s.duracao} onChange={(e) => setStep(i, { duracao: e.target.value })} />
                <input className="input !py-1.5 text-xs" placeholder="Entregáveis" value={s.entregaveis || ""} onChange={(e) => setStep(i, { entregaveis: e.target.value })} />
                <button className="rounded-full p-1.5 text-red-400 hover:bg-red-50" onClick={() => setPrazo({ etapas: draft.prazo.etapas.filter((_, idx) => idx !== i) })}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="card space-y-3 p-5">
            <span className="label">Próximos passos e mensagem</span>
            <textarea className="input min-h-[80px] text-xs" value={linesText(draft.proximos_passos)} onChange={(e) => setDraft({ ...draft, proximos_passos: lines(e.target.value) })} placeholder="Um próximo passo por linha" />
            <textarea className="input min-h-[90px]" value={draft.mensagem_cliente} onChange={(e) => setDraft({ ...draft, mensagem_cliente: e.target.value })} placeholder="Mensagem curta para enviar junto com o PDF" />
          </div>

          {err && <p className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-600">{err}</p>}
          {info && <p className="rounded-xl bg-brand-money/10 p-3 text-xs font-semibold text-brand-money">{info}</p>}

          <div className="grid grid-cols-2 gap-2">
            <button className="btn-ghost" onClick={() => void salvar(false)} disabled={busy || pdfBusy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
            </button>
            <button className="btn-primary" onClick={() => void salvar(true)} disabled={busy || pdfBusy}>
              {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Gerar PDF
            </button>
          </div>
          {draft.pdf_url && (
            <button className="btn-ghost w-full" onClick={() => window.open(draft.pdf_url, "_blank", "noopener,noreferrer")}>
              <FileText className="h-4 w-4" /> Abrir PDF salvo
            </button>
          )}
        </>
      )}

      <div className="card p-5">
        <button className="flex w-full items-center justify-between" onClick={() => setHistoryOpen((v) => !v)}>
          <span className="flex items-center gap-2 text-sm font-extrabold text-brand-deep">
            <Clock className="h-4 w-4 text-brand-purple" /> Minhas propostas ({proposals.length})
          </span>
          <span className="text-[11px] font-bold text-brand-ink/40">{historyOpen ? "Fechar" : "Abrir"}</span>
        </button>
        {historyOpen && (
          <div className="mt-3 space-y-2">
            {proposals.length === 0 && <p className="text-xs text-brand-ink/50">Nenhuma proposta ainda. As propostas salvas ficam aqui e sincronizam com a sua conta.</p>}
            {proposals.map((p) => (
              <div key={p.id} className="rounded-xl border border-brand-purple/15 bg-white/60 p-3">
                <div className="flex items-start justify-between gap-2">
                  <button className="min-w-0 text-left" onClick={() => abrir(p)}>
                    <p className="truncate text-sm font-bold text-brand-deep">{p.cliente.empresa || p.cliente.nome || "Cliente sem nome"}</p>
                    <p className="truncate text-[11px] text-brand-ink/50">{PROPOSAL_TYPE_LABELS[p.tipo]} · {new Date(p.created_at).toLocaleDateString("pt-BR")}</p>
                    <p className="mt-0.5 text-[11px] font-semibold text-brand-purple">{p.investimento.texto || formatBRLRange(p.investimento.min, p.investimento.max) || "Investimento a definir"}</p>
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    <button className="rounded-full p-2 text-brand-purple hover:bg-brand-purple/10" title="Abrir PDF" onClick={() => void abrirPdf(p)}>
                      {pdfBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    </button>
                    <button className="rounded-full p-2 text-red-400 hover:bg-red-50" title="Excluir" onClick={() => void excluir(p)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {p.status === "pronta" && (
                  <p className="mt-1 flex items-center gap-1 text-[10px] font-bold text-brand-money"><CheckCircle2 className="h-3 w-3" /> PDF pronto</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-brand-purple/15 bg-white/60 p-4 text-[11px] leading-relaxed text-brand-ink/60">
        <p className="flex items-center gap-1 font-bold text-brand-deep"><Coins className="h-3.5 w-3.5 text-brand-gold" /> Como funciona a cobrança</p>
        <p className="mt-1">Cada geração de proposta consome Doods. O PDF é gerado no seu aparelho e não consome Doods extras. O que não usa IA continua livre.</p>
        <p className="mt-1">1 Dood = R$ 0,01. Recarregue na aba <b>Dood's</b>.</p>
      </div>
    </div>
  );
}
