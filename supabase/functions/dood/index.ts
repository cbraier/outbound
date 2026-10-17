import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const FEE_PCT = 0.06; // taxa de serviço (6%) — web/Pix

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    // ---- Webhook do RevenueCat (compra confirmada pela loja) → credita a conta ----
    const rcSecret = Deno.env.get("RC_WEBHOOK_SECRET") || "";
    const rcAuth = req.headers.get("Authorization") || "";
    const isRcWebhook = rcSecret && rcAuth === `Bearer ${rcSecret}`;
    if (isRcWebhook) {
      const adminW = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
      const payload = await req.json().catch(() => ({}));
      const ev = (payload?.event ?? {}) as { type?: string; app_user_id?: string; product_id?: string; transaction_id?: string };
      const isPurchase = ["NON_RENEWING_PURCHASE", "INITIAL_PURCHASE", "PRODUCT_CHANGE", "UNCANCELLATION"].includes(ev.type || "");
      const uidW = ev.app_user_id;
      const txn = ev.transaction_id || "";
      const pid = ev.product_id || "";
      if (!isPurchase || !uidW || !pid) return json({ ok: true, ignored: ev.type || "unknown" });
      const { data: jaW } = await adminW.from("iap_transactions").select("transaction_id").eq("transaction_id", txn).maybeSingle();
      if (jaW) return json({ ok: true, already: true });
      const { data: prodW } = await adminW.from("iap_products").select("dood_amount,platform").eq("sku", pid).limit(1).maybeSingle();
      if (!prodW) return json({ ok: true, unknown_product: pid });
      const doodsW = Number(prodW.dood_amount);
      const { data: balW } = await adminW.rpc("credit_wallet", { p_user: uidW, p_doods: doodsW, p_kind: "topup", p_ref: txn });
      await adminW.from("iap_transactions").insert({ transaction_id: txn, user_id: uidW, platform: prodW.platform || "ios", sku: pid, dood_credited: doodsW, raw: payload });
      return json({ ok: true, credited: doodsW, balance: typeof balW === "number" ? balW : null });
    }

    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: u, error: uErr } = await userClient.auth.getUser();
    const uid = u?.user?.id;
    if (uErr || !uid) return json({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const body = (await req.json().catch(() => ({}))) as {
      action?: string; app?: string; op?: string; ref?: string; amount_brl?: number; limit?: number;
    };
    const app = body.app || "outbound";

    // ---- Carteira + preços ----
    if (!body.action || body.action === "wallet") {
      const { data: w } = await admin.from("wallets").select("balance").eq("user_id", uid).maybeSingle();
      const { data: pricing } = await admin.from("pricing").select("action,dood_cost").eq("app", app);
      const balance = w?.balance ?? 0;
      return json({ balance_doods: balance, balance_brl: (balance / 100).toFixed(2), pricing: pricing ?? [] });
    }

    // ---- Extrato ----
    if (body.action === "ledger") {
      const { data } = await admin
        .from("ledger").select("id,kind,app,action,dood_delta,balance_after,created_at")
        .eq("user_id", uid).order("id", { ascending: false }).limit(Math.min(100, Number(body.limit) || 30));
      return json({ items: data ?? [] });
    }

    // ---- Cobrar uma ação ----
    if (body.action === "charge") {
      const op = (body.op || "").trim();
      if (!op) return json({ error: "missing_op" }, 400);
      const { data, error } = await admin.rpc("charge_wallet", { p_user: uid, p_app: app, p_action: op, p_ref: body.ref || null });
      if (error) return json({ error: error.message }, 500);
      const row = Array.isArray(data) ? data[0] : data;
      const ok = !!row?.ok;
      return json({ ok, balance_doods: row?.saldo ?? null, dood_cost: row?.custo ?? null, message: row?.msg ?? "" });
    }

    // ---- Intenção de recarga (valor base + 6%) — web/Pix; IAP é validado pela loja ----
    if (body.action === "topup_intent") {
      const amount = Math.max(0, Number(body.amount_brl) || 0);
      const fee = Math.round(amount * FEE_PCT * 100) / 100;
      const total = Math.round((amount + fee) * 100) / 100;
      const doods = Math.round(amount * 100); // 1 Dood = R$ 0,01
      return json({ amount_brl: amount, fee_brl: fee, total_brl: total, doods });
    }

    // ---- Tabela de pacotes (recarga) ----
    if (body.action === "topup_products") {
      const { data } = await admin.from("iap_products").select("sku,platform,amount_brl,dood_amount").eq("platform", body.ref || "ios");
      return json({ items: data ?? [] });
    }

    // ---- Credita uma compra IAP (consumível) — idempotente por transaction_id ----
    if (body.action === "iap_credit") {
      const platform = body.ref === "android" ? "android" : "ios";
      const productId = (body as { product_id?: string; transaction_id?: string }).product_id || "";
      const txn = (body as { transaction_id?: string }).transaction_id || body.ref || "";
      if (!productId || !txn) return json({ error: "missing_product_or_txn" }, 400);
      // já creditado?
      const { data: ja } = await admin.from("iap_transactions").select("transaction_id").eq("transaction_id", txn).maybeSingle();
      if (ja) {
        const { data: w } = await admin.from("wallets").select("balance").eq("user_id", uid).maybeSingle();
        return json({ ok: true, already: true, balance_doods: w?.balance ?? 0 });
      }
      const { data: prod } = await admin.from("iap_products").select("dood_amount").eq("sku", productId).eq("platform", platform).maybeSingle();
      if (!prod) return json({ error: "unknown_product" }, 404);
      const doods = Number(prod.dood_amount);
      const { data: bal } = await admin.rpc("credit_wallet", { p_user: uid, p_doods: doods, p_kind: "topup", p_ref: txn });
      await admin.from("iap_transactions").insert({ transaction_id: txn, user_id: uid, platform, sku: productId, dood_credited: doods });
      return json({ ok: true, doods_credited: doods, balance_doods: typeof bal === "number" ? bal : null });
    }

    return json({ error: "unknown_action" }, 404);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "internal" }, 500);
  }
});
