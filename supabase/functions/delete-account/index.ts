import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: u, error: uErr } = await userClient.auth.getUser();
    const uid = u?.user?.id;
    if (uErr || !uid) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(url, svc);

    // Apaga dados do usuário
    await admin.from("leads").delete().eq("user_id", uid);
    await admin.from("agenda_events").delete().eq("user_id", uid);
    await admin.from("profiles").delete().eq("user_id", uid);

    // Apaga arquivos (buckets)
    for (const bucket of ["lead_photos", "profile_docs"]) {
      try {
        const { data: files } = await admin.storage.from(bucket).list(uid, { limit: 1000 });
        if (files?.length) {
          await admin.storage.from(bucket).remove(files.map((f) => `${uid}/${f.name}`));
        }
      } catch { /* ignora */ }
    }

    // Apaga a conta (auth)
    const { error } = await admin.auth.admin.deleteUser(uid);
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
