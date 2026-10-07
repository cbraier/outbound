import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Save } from "lucide-react";

const PROVIDERS = [
  { v: "default", label: "Padrão do app (Gemini grátis)" },
  { v: "gemini", label: "Gemini (minha chave)" },
  { v: "openai", label: "ChatGPT / OpenAI (minha chave)" },
  { v: "anthropic", label: "Claude / Anthropic (minha chave)" },
];

export default function ProfilePage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [f, setF] = useState({
    nome: "",
    site: "",
    ai_instruction: "",
    professional_profile: "",
    fixed_message: "",
    ai_provider: "default",
    ai_api_key: "",
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
            site: data.site || "",
            ai_instruction: data.ai_instruction || "",
            professional_profile: data.professional_profile || "",
            fixed_message: data.fixed_message || "",
            ai_provider: data.ai_provider || "default",
            ai_api_key: data.ai_api_key || "",
          });
        }
        setLoading(false);
      });
  }, [user?.id]);

  const salvar = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").upsert({ user_id: user.id, email: user.email, ...f }, { onConflict: "user_id" });
    setSaving(false);
    if (error) {
      alert("Erro ao salvar: " + error.message);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-brand-pink" /></div>;

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-24">
      <div className="card p-5">
        <h2 className="text-lg font-extrabold text-brand-deep">Seu perfil para a IA</h2>
        <p className="mb-3 text-xs text-brand-ink/60">
          Escreva tudo o que a IA precisa saber para montar as abordagens: quem você é, o que faz, onde atende, formas de pagamento, diferenciais...
        </p>
        <div className="space-y-3">
          <div><span className="label">Seu nome / empresa</span><input className="input" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></div>
          <div><span className="label">Seu site</span><input className="input" value={f.site} onChange={(e) => setF({ ...f, site: e.target.value })} placeholder="seusite.com.br" /></div>
          <div>
            <span className="label">Instrução para a IA (o que você faz / onde atende / como paga)</span>
            <textarea className="input min-h-[140px]" value={f.ai_instruction} onChange={(e) => setF({ ...f, ai_instruction: e.target.value })} />
          </div>
          <div>
            <span className="label">Perfil profissional (serviços, preços, diferenciais)</span>
            <textarea className="input min-h-[120px]" value={f.professional_profile} onChange={(e) => setF({ ...f, professional_profile: e.target.value })} />
          </div>
          <div>
            <span className="label">Mensagem fixa (caso não queira usar IA)</span>
            <textarea className="input min-h-[110px]" value={f.fixed_message} onChange={(e) => setF({ ...f, fixed_message: e.target.value })} placeholder="Use {saudacao}, {estabelecimento} e {site}." />
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="text-lg font-extrabold text-brand-deep">Inteligência Artificial</h2>
        <p className="mb-3 text-xs text-brand-ink/60">Use o padrão do app (Gemini) ou conecte a sua própria IA.</p>
        <div className="space-y-3">
          <div>
            <span className="label">Provedor</span>
            <select className="input" value={f.ai_provider} onChange={(e) => setF({ ...f, ai_provider: e.target.value })}>
              {PROVIDERS.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}
            </select>
          </div>
          {f.ai_provider !== "default" && (
            <div>
              <span className="label">Sua API key ({f.ai_provider})</span>
              <input className="input" value={f.ai_api_key} onChange={(e) => setF({ ...f, ai_api_key: e.target.value })} placeholder="cole sua chave" />
            </div>
          )}
        </div>
      </div>

      <button className="btn-primary w-full" onClick={salvar} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {saved ? "Atualizado!" : "Atualizar"}
      </button>
    </div>
  );
}
