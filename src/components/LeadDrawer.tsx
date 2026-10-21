import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { chargeDood } from "@/lib/dood";
import { type Lead, type Stage, STAGES, STAGE_LABELS } from "@/lib/types";
import { brWaLink, openExternalLink } from "@/lib/wa";
import { montar } from "@/lib/message";
import ProposalPage from "@/components/ProposalPage";
import { X, Sparkles, Loader2, Send, Save, MessageCircle, ExternalLink, CalendarClock, Search, Trash2 } from "lucide-react";

const TIPOS_AG = [
  { v: "follow-up", label: "Follow-up" },
  { v: "reuniao", label: "Reunião" },
  { v: "ligacao", label: "Ligação" },
  { v: "visita", label: "Visita" },
  { v: "outro", label: "Outro" },
];

export default function LeadDrawer({
  lead,
  profile,
  onClose,
  onSaved,
  onGoToAgenda,
  onGoToDoods,
}: {
  lead: Lead;
  profile: { nome?: string | null; company?: string | null; socials?: Record<string, string> | null; ai_instruction: string | null; professional_profile: string | null; fixed_message: string | null; followup_message?: string | null; ai_provider: string | null; ai_api_key: string | null; site: string | null; region?: string | null; radius_km?: number | null };
  onClose: () => void;
  onSaved: () => void;
  onGoToAgenda?: (d?: Date) => void;
  onGoToDoods?: () => void;
}) {
  const [l, setL] = useState<Lead>(lead);
  const [msg, setMsg] = useState(lead.mensagem || "");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [iaInfo, setIaInfo] = useState("");
  const [tipoOpen, setTipoOpen] = useState(false);
  const [webBusy, setWebBusy] = useState(false);
  const [webInfo, setWebInfo] = useState("");
  const dirtyRef = useRef(false);

  useEffect(() => setL(lead), [lead]);

  const upd = (patch: Partial<Lead>) => { dirtyRef.current = true; setL((p) => ({ ...p, ...patch })); };
  const editarMsg = (v: string) => { dirtyRef.current = true; setMsg(v); };

  const pesquisarWeb = async () => {
    setWebBusy(true);
    setWebInfo("");
    try {
      const ch = await chargeDood("lead_enrich", l.id);
      if (!ch.ok) { alert("Sem Doods suficientes para pesquisar. Recarregue na aba Dood's."); return; }
      const { data, error } = await supabase.functions.invoke("ai-message", {
        body: {
          action: "enrich",
          nome: l.nome,
          site: l.site || undefined,
          city: l.cidade || l.endereco || undefined,
          phone: l.telefone || undefined,
          region: profile.region || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) {
        setWebInfo(data.error);
        return;
      }
      const texto = data.texto || data.resumo || "";
      // Preenche automaticamente SÓ os campos vazios (nunca sobrescreve o que você digitou).
      const patch: Partial<Lead> = { web_research: texto };
      const preenchidos: string[] = [];
      const cidadeWeb = data?.cidade ? String(data.cidade).trim() : "";
      if (cidadeWeb && !l.cidade) { patch.cidade = cidadeWeb; preenchidos.push("cidade"); }
      const redeWeb = data?.rede_social ? String(data.rede_social).trim() : "";
      if (redeWeb && !l.rede_social) { patch.rede_social = redeWeb; preenchidos.push("rede social"); }
      const siteWeb = data?.site ? String(data.site).trim() : "";
      if (siteWeb && !l.site) { patch.site = siteWeb; preenchidos.push("site"); }
      const telWeb = data?.telefone ? String(data.telefone).replace(/\D/g, "") : "";
      if (telWeb && !l.telefone) { patch.telefone = telWeb; preenchidos.push("telefone"); }
      const endWeb = data?.endereco ? String(data.endereco).trim() : "";
      if (endWeb && !l.endereco) { patch.endereco = endWeb; preenchidos.push("endereço"); }
      upd(patch);
      await supabase.from("leads").update(patch as never).eq("id", l.id);
      setWebInfo((texto || "Encontrei informações na web.") + (preenchidos.length ? `\n\n✓ Preenchi: ${preenchidos.join(", ")}.` : ""));
    } catch (e) {
      setWebInfo(e instanceof Error ? e.message : "Falha na pesquisa");
    } finally {
      setWebBusy(false);
    }
  };

  const gerarIA = async () => {
    setBusy(true);
    setIaInfo("");
    try {
      const ch = await chargeDood("lead_message", l.id);
      if (!ch.ok) { alert("Sem Doods suficientes para elaborar. Recarregue na aba Dood's."); return; }
      const reqBody = {
        action: "message",
        instruction: profile.ai_instruction,
        professional_profile: profile.professional_profile,
        provider: profile.ai_provider || "default",
        api_key: profile.ai_api_key || undefined,
        seller_region: profile.region || undefined,
        lead: { nome: l.nome, categoria: l.categoria, tags: l.tags, rede_social: l.rede_social, site: l.site, endereco: l.endereco, bairro: l.bairro, cidade: l.cidade, estado: l.estado, web_research: l.web_research },
      };
      let r = await supabase.functions.invoke("ai-message", { body: reqBody });
      if (r.error) {
        // queda momentânea de rede/cold start — tenta mais uma vez
        await new Promise((res) => setTimeout(res, 1500));
        r = await supabase.functions.invoke("ai-message", { body: reqBody });
      }
      const { data, error } = r;
      if (error) {
        const em = (error as { message?: string }).message || "";
        throw new Error(/failed to send|network|fetch|load failed/i.test(em)
          ? "A conexão com a IA falhou. Verifique a internet e toque em Elaborar de novo."
          : em || "Falha ao elaborar");
      }
      if (data?.error) throw new Error(data.error);
      const texto = montar(data?.mensagem || "", { estabelecimento: l.nome, site: profile.site || l.site || "" });
      setMsg(texto);
      const tags = Array.isArray(data?.tags) ? Array.from(new Set([...(l.tags || []), ...(data.tags as string[])])) : l.tags;
      upd({ mensagem: texto, tags });
      setIaInfo("✓ Mensagem elaborada. Revise e envie.");
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
    setMsg(montar(profile.fixed_message, { estabelecimento: l.nome, site: profile.site || l.site || "" }));
  };

  const usarPesquisa = () => {
    const tpl = (profile.followup_message || "").trim();
    if (!tpl) {
      alert("Cadastre a mensagem “Pesquisa” no Perfil.");
      return;
    }
    setMsg(montar(tpl, { estabelecimento: l.nome, site: profile.site || l.site || "" }));
  };

  const salvar = async (etapa?: Stage): Promise<boolean> => {
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
      ...(etapa
        ? {
            etapa,
            last_contact_at: etapa === "prospect" ? new Date().toISOString() : l.last_contact_at,
            ...(etapa === "prospect" && !l.followup_due_at
              ? { followup_due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() }
              : {}),
          }
        : {}),
    };
    const doUpdate = () => supabase.from("leads").update(patch).eq("id", l.id).select("id");
    try {
      let res = await doUpdate();
      if (res.error) res = await doUpdate(); // 1 retry — conexão do celular oscila
      setSaving(false);
      if (res.error) {
        alert("Não deu pra salvar agora (conexão). Verifique a internet e tente de novo.\n\n" + res.error.message);
        return false;
      }
      // Enviou a 1ª mensagem → cria o follow-up "Pesquisa" na Agenda (D+1)
      if (etapa === "prospect" && !l.followup_due_at) {
        await supabase.from("agenda_events").insert({
          user_id: l.user_id,
          titulo: `Pesquisa — ${l.nome}`,
          tipo: "follow-up",
          data_inicio: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          alerta_minutos: 30,
          lead_id: l.id,
        } as never);
      }
      onSaved();
      return true;
    } catch (e) {
      setSaving(false);
      alert("Não deu pra salvar agora (conexão). Verifique a internet e tente de novo.");
      console.warn("[salvar lead]", e);
      return false;
    }
  };

  const excluir = async () => {
    if (!confirm(`Excluir o lead “${l.nome}”? Essa ação não pode ser desfeita.`)) return;
    const { error } = await supabase.from("leads").delete().eq("id", l.id);
    if (error) {
      alert("Não deu pra excluir: " + error.message);
      return;
    }
    onSaved();
  };

  const agendar = async (tipo: string, label: string) => {
    const when = new Date(Date.now() + 24 * 60 * 60 * 1000);
    when.setHours(9, 0, 0, 0);
    const { error } = await supabase.from("agenda_events").insert({
      user_id: l.user_id,
      titulo: `${label} — ${l.nome}`,
      tipo,
      data_inicio: when.toISOString(),
      alerta_minutos: 30,
      lead_id: l.id,
    } as never);
    if (error) {
      alert("Não deu pra agendar: " + error.message);
      return;
    }
    setTipoOpen(false);
    onSaved();
    onGoToAgenda?.(when);
  };

  const stageIdx = STAGES.indexOf(l.etapa);
  const mover = (dir: -1 | 1) => {
    const ni = stageIdx + dir;
    if (ni < 0 || ni >= STAGES.length) return;
    void salvar(STAGES[ni]);
  };

  const enviarWhats = async () => {
    const texto = montar(msg || profile.fixed_message || "", { estabelecimento: l.nome, site: profile.site || l.site || "" });
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
      <div
        className="h-full w-full max-w-lg overflow-y-auto bg-white px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-[calc(env(safe-area-inset-top)+1rem)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="rounded-full bg-brand-purple/10 px-3 py-1 text-xs font-bold text-brand-ink">
            {STAGE_LABELS[l.etapa]}
          </span>
          <button onClick={onClose} className="relative z-10 -mr-1 rounded-full p-3 hover:bg-black/5" aria-label="Fechar">
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
          <div className="grid grid-cols-2 gap-2">
            <div><span className="label">Cidade</span><input className="input" value={l.cidade || ""} onChange={(e) => upd({ cidade: e.target.value })} placeholder="Ex.: Canoas/RS" /></div>
            <div><span className="label">Estado</span><input className="input" value={l.estado || ""} onChange={(e) => upd({ estado: e.target.value })} /></div>
          </div>
        </div>

        {/* PASSO 1 · PESQUISA NA WEB */}
        <div className="mt-5 space-y-2">
          <span className="label">Passo 1 · Pesquisa na web (recomendado)</span>
          <p className="text-[11px] leading-snug text-brand-ink/60">
            Pesquise este prospect antes de escrever: a busca traz site, redes e um resumo que a IA usa para deixar a mensagem mais certeira e personalizada.
          </p>
          <button className="btn-ghost w-full !py-2 !text-xs" onClick={pesquisarWeb} disabled={webBusy} title="Pesquisar este prospect na web">
            {webBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />} {webBusy ? "Pesquisando na web..." : "Pesquisar este prospect na web"}
          </button>
          {webInfo && <p className="whitespace-pre-wrap rounded-xl bg-brand-purple/5 p-2 text-[11px] text-brand-ink/70">{webInfo}</p>}
        </div>

        {/* PASSO 2 · MENSAGEM */}
        <div className="mt-5 space-y-2">
          <span className="label">Passo 2 · Mensagem de abordagem</span>
          <div className="flex gap-2">
            <button className="btn-ghost flex-1 !py-2 !text-xs" onClick={usarFixa}>Usar mensagem fixa</button>
            <button className="btn-ghost flex-1 !py-2 !text-xs" onClick={usarPesquisa}>Usar follow-up</button>
          </div>
          <button className="btn-primary w-full" onClick={gerarIA} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Elaborar com IA
          </button>
          <textarea className="input min-h-[170px] font-mono text-xs" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Toque em 'Elaborar com IA' ou escreva a abordagem..." />
          {iaInfo && <p className="text-[11px] font-semibold text-brand-money">{iaInfo}</p>}
        </div>

        {/* ETAPA */}
        <div className="mt-5 rounded-2xl border border-brand-purple/15 bg-white/60 p-3">
          <div className="flex items-center justify-between">
            <span className="label">Etapa no funil</span>
            <span className="rounded-full bg-brand-purple/10 px-2.5 py-0.5 text-[11px] font-bold text-brand-deep">{STAGE_LABELS[l.etapa]}</span>
          </div>
          <div className="mt-2 flex gap-2">
            <button className="btn-ghost flex-1 !py-2 !text-xs" onClick={() => mover(-1)} disabled={saving || stageIdx <= 0}>◂ Voltar etapa</button>
            <button className="btn-ghost flex-1 !py-2 !text-xs" onClick={() => mover(1)} disabled={saving || stageIdx >= STAGES.length - 1}>Avançar etapa ▸</button>
          </div>
        </div>

        {/* AÇÕES */}
        <div className="mt-5 space-y-2">
          <span className="label">Ações</span>
          <button className="btn-primary w-full" onClick={enviarWhats}>
            <MessageCircle className="h-4 w-4" /> Enviar no WhatsApp
          </button>
          <div className="flex gap-2">
            <button className="btn-ghost flex-1 !py-2 !text-xs" onClick={() => salvar()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
            </button>
            <button className="btn-ghost flex-1 !py-2 !text-xs" onClick={() => setTipoOpen((v) => !v)} title="Agendar compromisso">
              <CalendarClock className="h-4 w-4" /> Agendar
            </button>
          </div>
          {tipoOpen && (
            <div className="grid grid-cols-3 gap-2 rounded-xl border border-brand-purple/20 bg-brand-purple/5 p-2">
              <span className="col-span-3 text-[11px] font-semibold text-brand-deep">Compromisso (amanhã, 9h):</span>
              {TIPOS_AG.map((t) => (
                <button key={t.v} className="btn-ghost !px-2 !py-1.5 !text-xs" onClick={() => agendar(t.v, t.label)}>
                  {t.label}
                </button>
              ))}
            </div>
          )}
          <p className="text-[11px] leading-snug text-brand-ink/50">
            "Salvar" guarda o lead e a mensagem sem enviar. Ao enviar no WhatsApp, o lead vai para <b>Prospect</b> e um follow-up é agendado.
          </p>
        </div>

        {/* PROPOSTA COMERCIAL DENTRO DO LEAD */}
        <div className="mt-6 border-t border-brand-purple/10 pt-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="label">Proposta comercial</span>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
              Auditoria grátis · 0 Doods
            </span>
          </div>
          <p className="mb-3 text-[11px] leading-snug text-brand-ink/55">
            Audite o site deste lead, cole a conversa do WhatsApp e gere a proposta sem sair do lead. O site já vem preenchido.
          </p>
          <ProposalPage
            key={l.id}
            userId={l.user_id}
            profile={profile}
            lead={l}
            embedded
            onGoToDoods={onGoToDoods ? () => { onGoToDoods(); onClose(); } : undefined}
            onSiteChange={(site) => {
              upd({ site });
              void supabase.from("leads").update({ site } as never).eq("id", l.id);
            }}
          />
        </div>

        {/* EXCLUIR */}
        <div className="mt-5 border-t border-brand-purple/10 pt-3">
          <button className="btn-ghost w-full !text-red-600" onClick={excluir}>
            <Trash2 className="h-4 w-4" /> Excluir lead
          </button>
        </div>
      </div>

      {zoom && l.foto_url && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" onClick={() => setZoom(false)}>
          <img src={l.foto_url} alt="" className="max-h-full max-w-full rounded-2xl" />
        </div>
      )}
    </div>
  );
}
