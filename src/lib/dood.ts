import { supabase } from "@/lib/supabase";

export type DoodPrice = { action: string; dood_cost: number };
export type DoodWallet = { balance: number; pricing: DoodPrice[] };

const APP = "outbound";
let cache: { data: DoodWallet; at: number } | null = null;

export async function getWallet(force = false): Promise<DoodWallet> {
  if (cache && !force && Date.now() - cache.at < 15000) return cache.data;
  try {
    const { data } = await supabase.functions.invoke("dood", { body: { action: "wallet", app: APP } });
    const w: DoodWallet = { balance: Number(data?.balance_doods ?? 0), pricing: data?.pricing ?? [] };
    cache = { data: w, at: Date.now() };
    return w;
  } catch {
    return cache?.data ?? { balance: 0, pricing: [] };
  }
}

export function priceOf(pricing: DoodPrice[], op: string): number {
  return pricing.find((p) => p.action === op)?.dood_cost ?? 0;
}

export type ChargeResult = { ok: boolean; balance: number; cost: number; message: string };

export async function chargeDood(op: string, ref?: string): Promise<ChargeResult> {
  try {
    const { data, error } = await supabase.functions.invoke("dood", { body: { action: "charge", app: APP, op, ref } });
    if (error) return { ok: false, balance: 0, cost: 0, message: "network" };
    const bal = Number(data?.balance_doods ?? 0);
    if (cache) cache = { data: { ...cache.data, balance: bal }, at: Date.now() };
    return { ok: !!data?.ok, balance: bal, cost: Number(data?.dood_cost ?? 0), message: String(data?.message ?? "") };
  } catch {
    return { ok: false, balance: 0, cost: 0, message: "network" };
  }
}

export async function getLedger(limit = 30): Promise<{ id: number; kind: string; app: string | null; action: string | null; dood_delta: number; balance_after: number; created_at: string }[]> {
  try {
    const { data } = await supabase.functions.invoke("dood", { body: { action: "ledger", limit } });
    return data?.items ?? [];
  } catch {
    return [];
  }
}

export async function topupIntent(amountBrl: number): Promise<{ amount_brl: number; fee_brl: number; total_brl: number; doods: number }> {
  const { data } = await supabase.functions.invoke("dood", { body: { action: "topup_intent", amount_brl: amountBrl } });
  return data ?? { amount_brl: amountBrl, fee_brl: +(amountBrl * 0.06).toFixed(2), total_brl: +(amountBrl * 1.06).toFixed(2), doods: Math.round(amountBrl * 100) };
}

export function clearWalletCache() {
  cache = null;
}
