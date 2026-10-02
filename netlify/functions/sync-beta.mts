export default async (req: Request) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const token = process.env.VENTRYVO_BETA_SYNC_TOKEN;
  if (!token) {
    console.error("VENTRYVO_BETA_SYNC_TOKEN is not configured.");
    return Response.json({ error: "Server configuration error" }, { status: 500 });
  }

  const upstreamUrl = `https://hzxiljqrqmtzsksxsdyj.supabase.co/functions/v1/netlify-beta-form?token=${encodeURIComponent(token)}`;

  if (req.method === "GET") {
    const upstream = await fetch(upstreamUrl);
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Expected JSON body" }, { status: 400 });
  }

  const upstream = await fetch(
    upstreamUrl,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  const text = await upstream.text();

  return new Response(text, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
};

export const config = {
  path: "/api/sync-beta",
};