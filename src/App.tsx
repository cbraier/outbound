import { useCallback, useEffect, useState } from "react";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { type Lead } from "@/lib/types";
import Board from "@/components/Board";
import ProfilePage from "@/components/ProfilePage";
import NovoLead from "@/components/NovoLead";
import { type CapturedLead } from "@/components/PhotoCapture";
import { LayoutGrid, User, LogOut, Plus } from "lucide-react";

interface ProfileRow {
  ai_instruction: string | null;
  professional_profile: string | null;
  fixed_message: string | null;
  ai_provider: string | null;
  ai_api_key: string | null;
  site: string | null;
}

function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nome, setNome] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  const submit = async () => {
    setBusy(true);
    setErr("");
    setInfo("");
    try {
      const res = mode === "in" ? await signIn(email, password) : await signUp(email, password, nome);
      if (res.error) setErr(res.error);
      else if ("needsConfirm" in res && res.needsConfirm)
        setInfo(`Enviamos um e-mail de confirmação para ${email}. Confirme e depois toque em "Entrar".`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="card w-full max-w-sm p-6">
        <h1 className="text-2xl font-extrabold text-brand-deep">Outbound Sales</h1>
        <p className="mb-4 text-xs text-brand-ink/60">Fotografe a fachada e deixe a IA prospectar por você.</p>
        <div className="space-y-3">
          {mode === "up" && <div><span className="label">Nome</span><input className="input" value={nome} onChange={(e) => setNome(e.target.value)} /></div>}
          <div><span className="label">E-mail</span><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><span className="label">Senha</span><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        </div>
        {err && <p className="mt-2 text-xs text-red-500">{err}</p>}
        {info && <p className="mt-2 text-xs font-semibold text-brand-ink">{info}</p>}
        <button className="btn-primary mt-4 w-full" onClick={submit} disabled={busy || !email || !password}>
          {busy ? "..." : mode === "in" ? "Entrar" : "Criar conta"}
        </button>
        <button className="mt-2 w-full text-xs font-semibold text-brand-ink/60" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "Não tem conta? Criar" : "Já tenho conta? Entrar"}
        </button>
      </div>
    </div>
  );
}

function Shell() {
  const { user, loading, signOut } = useAuth();
  const [tab, setTab] = useState<"novo" | "board" | "perfil">("novo");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [profile, setProfile] = useState<ProfileRow | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: ls }, { data: pf }] = await Promise.all([
      supabase.from("leads").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
    ]);
    setLeads((ls as Lead[]) || []);
    let prof = pf as ProfileRow | null;
    if (!prof) {
      const nome = (user.user_metadata?.nome as string) || null;
      await supabase.from("profiles").upsert({ user_id: user.id, email: user.email, nome }, { onConflict: "user_id" });
      prof = { ai_instruction: null, professional_profile: null, fixed_message: null, ai_provider: null, ai_api_key: null, site: null };
    }
    setProfile(prof);
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const onCaptured = async (c: CapturedLead) => {
    if (!user) return;
    await supabase.from("leads").insert({
      user_id: user.id,
      nome: c.nome || "Estabelecimento",
      telefone: c.telefone || null,
      rede_social: c.rede_social || null,
      site: c.site || null,
      endereco: c.endereco || null,
      bairro: c.bairro || null,
      cidade: c.cidade || null,
      estado: c.estado || null,
      cep: c.cep || null,
      categoria: c.categoria || null,
      tags: c.tags || [],
      foto_url: c.foto_url || null,
      lat: c.lat ?? null,
      lng: c.lng ?? null,
      etapa: "lead",
    });
    await load();
  };

  if (loading) return <div className="flex min-h-full items-center justify-center">Carregando...</div>;
  if (!user) return <AuthScreen />;

  return (
    <div className="min-h-full pb-20">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-brand-pink/10 bg-white/70 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur">
        <h1 className="text-lg font-extrabold tracking-tight text-brand-deep">Outbound Sales</h1>
        <button onClick={signOut} className="rounded-full p-2 text-brand-ink/50 hover:bg-black/5" title="Sair">
          <LogOut className="h-4.5 w-4.5" />
        </button>
      </header>

      <main className="p-4">
        {tab === "novo" && <NovoLead userId={user.id} onCaptured={onCaptured} />}
        {tab === "board" && <Board leads={leads} profile={profile} onRefresh={load} />}
        {tab === "perfil" && <ProfilePage />}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-30 mx-auto flex max-w-md items-center justify-around border-t border-brand-pink/10 bg-white/85 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 backdrop-blur">
        <button onClick={() => setTab("novo")} className={`flex flex-col items-center gap-0.5 px-6 text-[11px] font-bold ${tab === "novo" ? "text-brand-pink" : "text-brand-ink/40"}`}>
          <Plus className="h-5 w-5" /> Novo
        </button>
        <button onClick={() => setTab("board")} className={`flex flex-col items-center gap-0.5 px-6 text-[11px] font-bold ${tab === "board" ? "text-brand-pink" : "text-brand-ink/40"}`}>
          <LayoutGrid className="h-5 w-5" /> Funil
        </button>
        <button onClick={() => setTab("perfil")} className={`flex flex-col items-center gap-0.5 px-6 text-[11px] font-bold ${tab === "perfil" ? "text-brand-pink" : "text-brand-ink/40"}`}>
          <User className="h-5 w-5" /> Perfil
        </button>
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
