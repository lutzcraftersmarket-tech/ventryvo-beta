import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const encoder = new TextEncoder();

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function textValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  if (value === null || value === undefined) return "";
  return String(value);
}

function arrayValue(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean);
  if (value === null || value === undefined || value === "") return [];
  return String(value).split(",").map((v) => v.trim()).filter(Boolean);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  const secretKey = secretKeys.default;
  const supabaseUrl = Deno.env.get("SUPABASE_URL");

  if (!secretKey || !supabaseUrl) {
    console.error("Missing Supabase Edge Function defaults.");
    return Response.json({ error: "Server configuration error" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const tokenHash = await sha256Hex(token);
  const { data: secretRow, error: secretError } = await supabase
    .from("webhook_secrets")
    .select("token_hash")
    .eq("name", "netlify-beta-form")
    .maybeSingle();

  if (secretError) {
    console.error("Secret lookup failed", secretError);
    return Response.json({ error: "Server configuration error" }, { status: 500 });
  }

  if (!secretRow || secretRow.token_hash !== tokenHash) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Expected JSON body" }, { status: 400 });
  }

  const payload = (body.payload && typeof body.payload === "object" ? body.payload : body) as Record<string, unknown>;
  const data = (payload.data && typeof payload.data === "object" ? payload.data : payload) as Record<string, unknown>;

  const formName = textValue(payload.form_name ?? payload.formName ?? data["form-name"]);
  if (formName && formName !== "ventryvo-beta-testers") {
    return Response.json({ error: "Unexpected form" }, { status: 400 });
  }

  const externalId = textValue(payload.id ?? payload.submission_id ?? body.id ?? data["submission-id"]) || null;

  if (externalId) {
    const { data: existing, error: existingError } = await supabase
      .from("beta_test_applications")
      .select("id")
      .eq("external_submission_id", externalId)
      .maybeSingle();

    if (existingError) {
      console.error("Duplicate check failed", existingError);
      return Response.json({ error: "Database error" }, { status: 500 });
    }

    if (existing) return Response.json({ ok: true, duplicate: true });
  }

  const record = {
    name: textValue(data.name),
    email: textValue(data.email),
    phone: textValue(data.phone) || null,
    organization: textValue(data.organization),
    city_state: textValue(data["city-state"]),
    website_facebook: textValue(data["website-facebook"]) || null,
    event_types: arrayValue(data["event-type"]),
    events_per_year: textValue(data["events-per-year"]),
    vendors_per_event: textValue(data["vendors-per-event"]),
    current_management: arrayValue(data["current-management"]),
    features_interested: arrayValue(data.features),
    use_real_event: textValue(data["use-real-event"]),
    report_bugs_feedback: textValue(data["report-bugs-feedback"]),
    biggest_headache: textValue(data["biggest-headache"]),
    indispensable_feature: textValue(data["indispensable-feature"]) || null,
    feedback_conversations: textValue(data["feedback-conversations"]),
    anything_else: textValue(data["anything-else"]) || null,
    beta_acknowledgement: Boolean(textValue(data["beta-acknowledgement"])),
    status: "new",
    source: "netlify",
    external_submission_id: externalId,
  };

  const required = [
    record.name,
    record.email,
    record.organization,
    record.city_state,
    record.events_per_year,
    record.vendors_per_event,
    record.use_real_event,
    record.report_bugs_feedback,
    record.biggest_headache,
    record.feedback_conversations,
  ];

  if (required.some((value) => !value)) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  const { data: inserted, error: insertError } = await supabase
    .from("beta_test_applications")
    .insert(record)
    .select("id")
    .single();

  if (insertError) {
    console.error("Insert failed", insertError);
    return Response.json({ error: "Database error" }, { status: 500 });
  }

  return Response.json({ ok: true, id: inserted.id });
});