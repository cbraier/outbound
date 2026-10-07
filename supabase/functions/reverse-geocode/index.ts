import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { lat, lng } = await req.json();
    if (typeof lat !== "number" || typeof lng !== "number") {
      return new Response(JSON.stringify({ error: "lat/lng obrigatórios" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let endereco = "", bairro = "", cidade = "", estado = "", cep = "", display = "";

    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=pt-BR`;
      const res = await fetch(url, { headers: { "User-Agent": "OutboundSales/1.0 (contato@zonn.com.br)", "Accept": "application/json" } });
      const j = await res.json().catch(() => ({}));
      const a = (j?.address || {}) as Record<string, string>;
      const rua = a.road || a.pedestrian || a.footway || a.path || a.neighbourhood || "";
      endereco = [rua, a.house_number || ""].filter(Boolean).join(", ");
      bairro = a.suburb || a.neighbourhood || a.city_district || "";
      cidade = a.city || a.town || a.village || a.municipality || "";
      estado = a.state || "";
      cep = a.postcode || "";
      display = j?.display_name || "";
    } catch { /* fallback */ }

    if (!endereco && !cidade) {
      try {
        const pres = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}`, { headers: { "User-Agent": "OutboundSales/1.0 (contato@zonn.com.br)" } });
        const pj = await pres.json().catch(() => ({}));
        const f = (pj?.features?.[0]?.properties || {}) as Record<string, string>;
        const rua = f.street || f.name || "";
        endereco = [rua, f.housenumber || ""].filter(Boolean).join(", ");
        bairro = f.district || f.locality || "";
        cidade = f.city || "";
        estado = f.state || "";
        cep = f.postcode || "";
        display = [rua, f.district, f.city, f.state].filter(Boolean).join(", ");
      } catch { /* vazio */ }
    }

    return new Response(JSON.stringify({ endereco, bairro, cidade, estado, cep, display }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
