import { useEffect, useState } from "react";
import { getCurrentOffering, purchase, restore } from "@/lib/billing";
import { Loader2, Check } from "lucide-react";

const BENEFITS = [
  "Leads ilimitados por foto",
  "Mensagem personalizada por ramo",
  "Funil, Radar, Agenda e follow-ups",
  "Sua própria IA ou o padrão do app",
];

export default function Paywall({ onDone, onSignOut }: { onDone: () => void; onSignOut?: () => void }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pkg, setPkg] = useState<any>(null);
  const [price, setPrice] = useState("R$ 29,90/mês");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      const off = await getCurrentOffering();
      const p = off?.monthly || off?.availablePackages?.[0] || null;
      if (p) {
        setPkg(p);
        if (p.product?.priceString) setPrice(p.product.priceString);
      }
    })();
  }, []);

  const comprar = async () => {
    if (!pkg) {
      setErr("Oferta indisponível agora. Feche e abra o app de novo.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const ok = await purchase(pkg);
      if (ok) onDone();
      else setErr("Assinatura não confirmada.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha na compra.");
    } finally {
      setBusy(false);
    }
  };

  const restaurar = async () => {
    setBusy(true);
    setErr("");
    try {
      const ok = await restore();
      if (ok) onDone();
      else setErr("Nenhuma assinatura ativa encontrada.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao restaurar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-gradient-to-br from-brand-pink via-brand-purple to-brand-deep p-6 text-white">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-brand-deep shadow-2xl">
        <div className="text-center">
          <span className="inline-block rounded-full bg-brand-pink/10 px-4 py-1 text-xs font-bold text-brand-magenta">Outbound Sales</span>
          <h1 className="mt-4 text-2xl font-black">Comece seus 3 dias grátis</h1>
          <p className="mt-1 text-xs text-brand-ink/60">Depois {price}. Cancele quando quiser.</p>
        </div>

        <div className="my-5 rounded-2xl bg-gradient-to-br from-brand-pink to-brand-purple p-5 text-center text-white">
          <p className="text-4xl font-black">{price}</p>
          <p className="text-xs font-semibold text-white/85">3 dias grátis para testar</p>
        </div>

        <div className="space-y-2">
          {BENEFITS.map((b) => (
            <p key={b} className="flex items-start gap-2 text-sm font-medium text-brand-ink/80">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-money" /> {b}
            </p>
          ))}
        </div>

        {err && <p className="mt-3 text-xs font-semibold text-red-500">{err}</p>}

        <button className="btn-primary mt-5 w-full" onClick={comprar} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Assinar e começar
        </button>
        <button className="mt-2 w-full text-xs font-semibold text-brand-ink/60" onClick={restaurar} disabled={busy}>
          Restaurar compras
        </button>
        {onSignOut && (
          <button className="mt-3 w-full text-[11px] font-semibold text-brand-ink/40" onClick={onSignOut}>
            Sair da conta
          </button>
        )}
      </div>
    </div>
  );
}
