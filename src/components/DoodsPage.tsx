import { useEffect, useState } from "react";
import { getWallet, getLedger, topupIntent, type DoodPrice } from "@/lib/dood";
import { purchaseDoods } from "@/lib/billing";
import { Loader2, Coins, Plus, RefreshCw } from "lucide-react";

const PRODUCT_BY_AMOUNT: Record<number, string> = {
  10: "com.braier.outbound.dood1000",
  20: "com.braier.outbound.dood2000",
  50: "com.braier.outbound.dood5000",
  100: "com.braier.outbound.dood10000",
  500: "com.braier.outbound.dood50000",
};

const PRESETS = [10, 20, 50, 100, 500];
const FEE_PCT = 6;
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function labelFor(e: { kind: string; action: string | null }): string {
  if (e.kind === "grant_signup") return "Bônus de boas-vindas";
  if (e.kind === "topup") return "Recarga";
  if (e.kind === "charge") {
    const map: Record<string, string> = {
      lead_vision: "Leitura de foto", lead_audio: "Áudio do lead", lead_message: "Mensagem com IA",
      lead_enrich: "Pesquisa do prospect", radar_discover: "Descobrir negócios", radar_enrich: "Importar descoberto",
      perfil_resume: "Leitura de currículo", perfil_research: "Pesquisa do perfil", perfil_interview: "Entrevista", perfil_audio: "Ditado",
      proposal_analyze: "Gerar proposta com IA",
    };
    return map[e.action ?? ""] ?? "Uso";
  }
  return e.kind;
}

export default function DoodsPage() {
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);
  const [pricing, setPricing] = useState<DoodPrice[]>([]);
  const [ledger, setLedger] = useState<{ id: number; kind: string; action: string | null; dood_delta: number; balance_after: number; created_at: string }[]>([]);
  const [selected, setSelected] = useState<number | null>(10);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const w = await getWallet(true);
    setBalance(w.balance);
    setPricing(w.pricing);
    setLedger(await getLedger(40));
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const amount = custom ? Number(custom.replace(",", ".")) : selected ?? 0;
  const doods = Math.round(amount * 100);

  const comprar = async () => {
    if (!amount || amount < 1) { alert("Escolha um valor de recarga."); return; }
    const productId = custom ? undefined : PRODUCT_BY_AMOUNT[amount];
    if (!productId) {
      alert("No app, escolha um dos valores (R$10, R$20, R$50, R$100 ou R$500). Valor personalizado, só no site.");
      return;
    }
    setBusy(true);
    const r = await purchaseDoods(productId);
    if (r.ok) {
      // o webhook do RevenueCat credita a conta — aguarda refletir
      for (let i = 0; i < 6; i++) {
        await new Promise((res) => setTimeout(res, 1500));
        const w = await getWallet(true);
        if (w.balance > balance) break;
      }
      await load();
      alert("Compra concluída! Seus Doods foram creditados.");
    } else if (r.error) {
      alert(r.error);
    }
    setBusy(false);
  };

  return (
    <div className="mx-auto max-w-md space-y-3">
      {/* Saldo */}
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <span className="label">Seu saldo</span>
          <button className="rounded-full p-1.5 hover:bg-black/5" onClick={load} title="Atualizar">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
        <div className="mt-1 flex items-end gap-2">
          <Coins className="h-7 w-7 text-brand-purple" />
          <span className="text-3xl font-black text-brand-deep">{balance.toLocaleString("pt-BR")}</span>
          <span className="pb-1 text-sm font-bold text-brand-ink/60">Doods</span>
        </div>
        <p className="mt-0.5 text-xs text-brand-ink/60">≈ {brl(balance / 100)} em créditos</p>
        <p className="mt-2 text-[11px] text-brand-ink/50">
          1 Dood = R$ 0,01. Tudo que usa IA consome Doods; o que não usa fica livre.
        </p>
      </div>

      {/* Recarga */}
      <div className="card p-5">
        <span className="label">Recarregar</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {PRESETS.map((v) => (
            <button
              key={v}
              onClick={() => { setSelected(v); setCustom(""); }}
              className={`rounded-full px-4 py-2 text-sm font-bold ${selected === v && !custom ? "bg-brand-pink text-white" : "border border-brand-purple/20 text-brand-deep"}`}
            >
              {brl(v)}
            </button>
          ))}
          <div className="flex items-center gap-1 rounded-full border border-brand-purple/20 px-3">
            <span className="text-xs font-bold text-brand-ink/50">R$</span>
            <input
              className="w-16 bg-transparent py-2 text-sm font-bold outline-none"
              inputMode="decimal"
              placeholder="outro"
              value={custom}
              onChange={(e) => { setCustom(e.target.value); setSelected(null); }}
            />
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between rounded-xl border border-brand-purple/15 bg-white/60 p-3 text-sm">
          <span className="font-bold text-brand-money">{doods.toLocaleString("pt-BR")} Doods</span>
          <span className="font-extrabold text-brand-deep">{brl(amount || 0)}</span>
        </div>

        <button className="btn-primary mt-3 w-full" onClick={comprar} disabled={busy || !amount}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Comprar {amount ? brl(amount) : ""}
        </button>
        <p className="mt-2 text-[11px] text-brand-ink/50">
          Créditos são consumíveis e pagos na App Store. Não expiram.
        </p>
      </div>

      {/* Preços por ação */}
      <div className="card p-5">
        <span className="label">Custo por ação</span>
        <div className="mt-2 space-y-1.5 text-sm">
          {pricing.map((p) => (
            <div key={p.action} className="flex justify-between text-brand-ink/70">
              <span>{labelFor({ kind: "charge", action: p.action })}</span>
              <span className="font-bold text-brand-deep">{p.dood_cost} Dood{p.dood_cost > 1 ? "s" : ""}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Extrato */}
      <div className="card p-5">
        <span className="label">Extrato</span>
        <div className="mt-2 space-y-2">
          {ledger.length === 0 && <p className="text-[12px] text-brand-ink/50">Sem movimentações ainda.</p>}
          {ledger.map((e) => (
            <div key={e.id} className="flex items-center justify-between text-sm">
              <div>
                <p className="font-semibold text-brand-deep">{labelFor(e)}</p>
                <p className="text-[11px] text-brand-ink/50">{new Date(e.created_at).toLocaleString("pt-BR")}</p>
              </div>
              <span className={`font-bold ${e.dood_delta < 0 ? "text-brand-ink/60" : "text-brand-money"}`}>
                {e.dood_delta > 0 ? "+" : ""}{e.dood_delta} · {e.balance_after}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
