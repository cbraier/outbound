import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { type Lead, type Stage, STAGE_LABELS } from "@/lib/types";
import { brWaLink, openExternalLink } from "@/lib/wa";
import { montar } from "@/lib/message";
import { X, Sparkles, Loader2, Send, Save, MessageCircle, ExternalLink } from "lucide-react";

export default function LeadDrawer({
  lead,
  profile,
  onClose,
  onSaved,
}: {
  lead: Lead;
  profile: { ai_instruction: string | null; professional_profile: string | null; fixed_message: string | null; ai_provider: string | null; ai_api_key: string | null; site: string | null };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [l, setL] = useState<Lead>(lead);
  const [msg, setMsg] = useState(lead.mensagem || "");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [zoom, setZoom] = useState(false);

  useEffect(() => setL(lead), [lead]);

  const upd = (patch: Partial<Lead>) => setL((p) => ({ ...p, ...patch }));

  const gerarIA = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-message", {
        body: {
          action: "message",
          instruction: profile.ai_instruction,
          professional_profile: profile.professional_profile,
          provider: profile.ai_provider || "default",
          api_key: profile.ai_api_key || undefined,
          lead: { nome: l.nome, categoria: l.categoria, tags: l.tags, rede_social: l.rede_social, site: l.site, endereco: l.endereco, bairro: l.bairro, cidade: l.cidade, estado: l.estado },
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const texto = montar(data?.mensagem || "", { estabelecimento: l.nome, site: l.site || profile.site || "" });
      setMsg(texto);
      const tags = Array.isArray(data?.tags) ? Array.from(new Set([...(l.tags || []), ...(data.tags as string[])])) : l.tags;
      upd({ mensagem: texto, tags });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Falha ao gerar");
    } finally {
      setBusy(false);
    }
  };

  const usarFixa = () => {
    if (!profile.fixed_message?.trim()) {
      alert("Você ainda não cadastrou uma mensagem fixa no Perfil.");
      return;
    }
    setMsg(montar(profile.fixed_message, { estabelecimento: l.nome, site: l.site || profile.site || "" }));
  };

  const salvar = async (etapa?: Stage) => {
    setSaving(true);
    const patch = {
      nome: l.nome,
      telefone: l.telefone,
      rede_social: l.rede_social,
      site: l.site,
      endereco: l.endereco,
      bairro: l.bairro,
      cidade: l.cidade,
      estado: l.estado,
      cep: l.cep,
      categoria: l.categoria,
      tags: l.tags,
      mensagem: msg,
      ...(etapa ? { etapa, last_contact_at: etapa === "prospect" ? new Date().toISOString() : l.last_contact_at } : {}),
    };
    const { error } = await supabase.from("leads").update(patch).eq("id", l.id);
    setSaving(false);
    if (error) {
      alert("Erro ao salvar: " + error.message);
      return;
    }
    onSaved();
  };

  const enviarWhats = async () => {
    const texto = montar(msg || profile.fixed_message || "", { estabelecimento: l.nome, site: l.site || profile.site || "" });
    if (!l.telefone) {
      alert("Cadastre um telefone para enviar no WhatsApp.");
      return;
    }
    openExternalLink(brWaLink(l.telefone, texto));
    // enviou → vira Prospect
    await salvar("prospect");
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <span className="rounded-full bg-brand-purple/10 px-3 py-1 text-xs font-bold text-brand-ink">
            {STAGE_LABELS[l.etapa]}
          </span>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-black/5">
            <X className="h-5 w-5" />
          </button>
        </div>

        {l.foto_url && (
          <button onClick={() => setZoom(true)} className="mb-3 block w-full overflow-hidden rounded-2xl border border-brand-pink/20">
            <img src={l.foto_url} alt="" className="h-44 w-full object-cover" />
            <span className="flex items-center justify-center gap-1 bg-white py-1 text-[11px] text-brand-ink/60">
              <ExternalLink className="h-3 w-3" /> tocar para ampliar
            </span>
          </button>
        )}

        <div className="space-y-2">
          <div><span className="label">Nome / Estabelecimento</span><input className="input" value={l.nome} onChange={(e) => upd({ nome: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><span className="label">Telefone</span><input className="input" value={l.telefone || ""} onChange={(e) => upd({ telefone: e.target.value.replace(/\D/g, "") })} /></div>
            <div><span className="label">Rede social</span><input className="input" value={l.rede_social || ""} onChange={(e) => upd({ rede_social: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><span className="label">Site</span><input className="input" value={l.site || ""} onChange={(e) => upd({ site: e.target.value })} /></div>
            <div><span className="label">Categoria</span><input className="input" value={l.categoria || ""} onChange={(e) => upd({ categoria: e.target.value })} /></div>
          </div>
          <div><span className="label">Endereço</span><input className="input" value={l.endereco || ""} onChange={(e) => upd({ endereco: e.target.value })} /></div>
        </div>

        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between">
            <span className="label">Mensagem</span>
            <div className="flex gap-2">
              <button className="btn-ghost !px-3 !py-1.5 !text-xs" onClick={usarFixa}>Fixa</button>
              <button className="btn-primary !px-3 !py-1.5 !text-xs" onClick={gerarIA} disabled={busy}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} IA
              </button>
            </div>
          </div>
          <textarea className="input min-h-[180px] font-mono text-xs" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Gere com IA ou escreva a abordagem..." />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={() => salvar()} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
          </button>
          <button className="btn-primary" onClick={enviarWhats}>
            <MessageCircle className="h-4 w-4" /> Enviar no WhatsApp
          </button>
        </div>
        <p className="mt-2 text-[11px] text-brand-ink/50">
          “Salvar” guarda o lead/mensagem sem enviar. Ao enviar, ele vai para <b>Prospect</b>.
        </p>
      </div>

      {zoom && l.foto_url && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" onClick={() => setZoom(false)}>
          <img src={l.foto_url} alt="" className="max-h-full max-w-full rounded-2xl" />
        </div>
      )}
    </div>
  );
}
