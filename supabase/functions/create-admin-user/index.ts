import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type CreateUserPayload = {
  email?: string;
  password?: string;
  full_name?: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "").trim();
    if (!jwt) {
      return new Response(
        JSON.stringify({ error: "Missing bearer token." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: callerData, error: callerErr } = await adminClient.auth.getUser(jwt);
    if (callerErr || !callerData.user?.id) {
      return new Response(
        JSON.stringify({ error: "Unauthorized caller." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: adminRow, error: adminErr } = await adminClient
      .from("users")
      .select("is_admin")
      .eq("id", callerData.user.id)
      .maybeSingle();
    if (adminErr) {
      return new Response(
        JSON.stringify({ error: adminErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!adminRow || Number(adminRow.is_admin) !== 1) {
      return new Response(
        JSON.stringify({ error: "Only admins can create users." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const payload = (await req.json()) as CreateUserPayload;
    const email = String(payload.email || "").trim().toLowerCase();
    const password = String(payload.password || "");
    const fullName = String(payload.full_name || "").trim();
    if (!email || !password || !fullName) {
      return new Response(
        JSON.stringify({ error: "email, password, and full_name are required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: createdAuth, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (createErr || !createdAuth.user?.id) {
      return new Response(
        JSON.stringify({ error: createErr?.message || "Could not create auth user." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const newUserId = String(createdAuth.user.id);
    const { error: profileErr } = await adminClient.from("users").upsert(
      {
        id: newUserId,
        email,
        name: fullName,
        is_admin: 0,
        is_vet: 0,
        is_active: 1,
      },
      { onConflict: "id" },
    );
    if (profileErr) {
      return new Response(
        JSON.stringify({ error: profileErr.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        user: { id: newUserId, email, full_name: fullName },
        message: "User created successfully.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unexpected error." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
