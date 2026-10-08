import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { scheduleAgendaNotifications, requestAgendaNotificationPermission } from "@/lib/agenda-notifications";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, isToday,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus, Loader2, Trash2, Bell, X } from "lucide-react";

interface Event {
  id: string;
  titulo: string;
  tipo: string;
  descricao: string | null;
  data_inicio: string;
  alerta_minutos: number | null;
  concluido: boolean;
  status: string | null;
}

const TIPOS = [
  { v: "follow-up", label: "Follow-up", cor: "#8b5cf6" },
  { v: "reuniao", label: "Reunião", cor: "#3b82f6" },
  { v: "ligacao", label: "Ligação", cor: "#f59e0b" },
  { v: "visita", label: "Visita", cor: "#10b981" },
  { v: "outro", label: "Outro", cor: "#6b7280" },
];

export default function AgendaPage() {
  const { user } = useAuth();
  const [cursor, setCursor] = useState(new Date());
  const [selected, setSelected] = useState(new Date());
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ id: "", titulo: "", tipo: "follow-up", descricao: "", data_inicio: "", alerta_minutos: 30 });

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("agenda_events").select("*").order("data_inicio", { ascending: true });
    const evs = (data as Event[]) || [];
    setEvents(evs);
    setLoading(false);
    const today = evs.filter((e) => isSameDay(new Date(e.data_inicio), new Date()));
    void scheduleAgendaNotifications(today);
  }, [user?.id]);

  useEffect(() => { void load(); }, [load]);

  const days = useMemo(() => eachDayOfInterval({ start: startOfMonth(cursor), end: endOfMonth(cursor) }), [cursor]);
  const dayEvents = events.filter((e) => isSameDay(new Date(e.data_inicio), selected));

  const abrirNovo = () => {
    const d = new Date(selected);
    d.setHours(9, 0, 0, 0);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setForm({ id: "", titulo: "", tipo: "follow-up", descricao: "", data_inicio: local, alerta_minutos: 30 });
    setFormOpen(true);
  };

  const abrirEdit = (e: Event) => {
    const d = new Date(e.data_inicio);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setForm({ id: e.id, titulo: e.titulo, tipo: e.tipo, descricao: e.descricao || "", data_inicio: local, alerta_minutos: e.alerta_minutos ?? 30 });
    setFormOpen(true);
  };

  const salvar = async () => {
    if (!user || !form.titulo.trim() || !form.data_inicio) {
      alert("Informe o título e a data/hora.");
      return;
    }
    setSaving(true);
    await requestAgendaNotificationPermission();
    const payload = {
      user_id: user.id,
      titulo: form.titulo.trim(),
      tipo: form.tipo,
      descricao: form.descricao.trim() || null,
      data_inicio: new Date(form.data_inicio).toISOString(),
      alerta_minutos: Number(form.alerta_minutos) || 30,
      cor: TIPOS.find((t) => t.v === form.tipo)?.cor || null,
    };
    const res = form.id
      ? await supabase.from("agenda_events").update(payload as never).eq("id", form.id)
      : await supabase.from("agenda_events").insert(payload as never);
    setSaving(false);
    if (res.error) { alert("Não deu pra salvar (conexão)."); return; }
    setFormOpen(false);
    await load();
  };

  const remover = async (id: string) => {
    if (!confirm("Excluir este compromisso?")) return;
    await supabase.from("agenda_events").delete().eq("id", id);
    await load();
  };

  const toggleDone = async (e: Event) => {
    await supabase.from("agenda_events").update({ concluido: !e.concluido } as never).eq("id", e.id);
    await load();
  };

  return (
    <div className="mx-auto max-w-md space-y-4 pb-24">
      <div className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <button onClick={() => setCursor(subMonths(cursor, 1))} className="rounded-full p-2 hover:bg-black/5"><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-sm font-extrabold capitalize text-brand-deep">
            {format(cursor, "MMMM 'de' yyyy", { locale: ptBR })}
          </span>
          <button onClick={() => setCursor(addMonths(cursor, 1))} className="rounded-full p-2 hover:bg-black/5"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
            <span key={i} className="text-[10px] font-bold text-brand-ink/40">{d}</span>
          ))}
          {Array.from({ length: startOfMonth(cursor).getDay() }).map((_, i) => <span key={`e${i}`} />)}
          {days.map((d) => {
            const has = events.some((e) => isSameDay(new Date(e.data_inicio), d));
            const sel = isSameDay(d, selected);
            return (
              <button
                key={d.toISOString()}
                onClick={() => setSelected(d)}
                className={`relative flex h-9 items-center justify-center rounded-xl text-xs font-semibold ${
                  sel ? "bg-gradient-to-br from-brand-pink to-brand-purple text-white" : isToday(d) ? "bg-brand-pink/10 text-brand-deep" : "text-brand-ink/70"
                }`}
              >
                {format(d, "d")}
                {has && !sel && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-brand-pink" />}
              </button>
            );
          })}
        </div>
      </div>

      <button className="btn-primary w-full" onClick={abrirNovo}><Plus className="h-4 w-4" /> Novo compromisso</button>

      <div className="card p-4">
        <p className="mb-2 text-xs font-bold text-brand-deep capitalize">{format(selected, "EEEE, d 'de' MMMM", { locale: ptBR })}</p>
        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-brand-pink" /></div>
        ) : dayEvents.length === 0 ? (
          <p className="py-3 text-center text-xs text-brand-ink/50">Nenhum compromisso neste dia.</p>
        ) : (
          <div className="space-y-2">
            {dayEvents.map((e) => (
              <div key={e.id} className="flex items-center gap-2 rounded-xl border border-brand-purple/15 bg-white/60 p-2">
                <span className="h-8 w-1 rounded-full" style={{ background: TIPOS.find((t) => t.v === e.tipo)?.cor || "#8b5cf6" }} />
                <button className="min-w-0 flex-1 text-left" onClick={() => abrirEdit(e)}>
                  <p className={`truncate text-sm font-bold ${e.concluido ? "text-brand-ink/40 line-through" : "text-brand-deep"}`}>{e.titulo}</p>
                  <p className="text-[11px] text-brand-ink/50">
                    {format(new Date(e.data_inicio), "HH:mm")} · {TIPOS.find((t) => t.v === e.tipo)?.label || e.tipo}
                  </p>
                </button>
                <button onClick={() => toggleDone(e)} className="rounded-full p-1.5 hover:bg-black/5" title="Concluir">{e.concluido ? "✅" : "○"}</button>
                <button onClick={() => remover(e.id)} className="rounded-full p-1.5 text-red-500 hover:bg-black/5"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/30" onClick={() => setFormOpen(false)}>
          <div className="w-full rounded-t-2xl bg-white p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-base font-extrabold text-brand-deep">{form.id ? "Editar" : "Novo"} compromisso</span>
              <button onClick={() => setFormOpen(false)} className="rounded-full p-2 hover:bg-black/5"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-2">
              <div><span className="label">Título</span><input className="input" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="label">Tipo</span>
                  <select className="input" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                    {TIPOS.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
                  </select>
                </div>
                <div><span className="label">Data/hora</span><input className="input" type="datetime-local" value={form.data_inicio} onChange={(e) => setForm({ ...form, data_inicio: e.target.value })} /></div>
              </div>
              <div><span className="label">Aviso (min antes)</span><input className="input" type="number" value={form.alerta_minutos} onChange={(e) => setForm({ ...form, alerta_minutos: Number(e.target.value) })} /></div>
              <div><span className="label">Observação</span><input className="input" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></div>
            </div>
            <button className="btn-primary mt-3 w-full" onClick={salvar} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />} Salvar compromisso
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
