// Načti.me Pro – předplatné přes Stripe (99 Kč měsíčně).
// Akce: status (je uživatel Pro?), checkout (odkaz na platbu), portal (správa předplatného).
// Potřebuje tajnou proměnnou STRIPE_SECRET_KEY. Webhook není nutný: stav se ověřuje přímo ve Stripe.
import { createClient } from "npm:@supabase/supabase-js@2";

const SITE = "https://nacti.me";
const ORIGINS = ["https://nacti.me", "http://nacti.me", "https://www.nacti.me"];
const PRICE_KEY = "nacti_pro_monthly";
const PRICE_CZK = 99;

function form(obj: Record<string, unknown>, prefix = ""): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v === undefined || v === null) continue;
    if (typeof v === "object") out.push(...form(v as Record<string, unknown>, key));
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out;
}
async function stripe(path: string, params?: Record<string, unknown>, method = params ? "POST" : "GET") {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) throw new Error("not_configured");
  const url = `https://api.stripe.com/v1/${path}` + (method === "GET" && params ? "?" + form(params).join("&") : "");
  const r = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: method === "POST" && params ? form(params).join("&") : undefined,
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || "stripe_error");
  return j;
}

async function priceId(): Promise<string> {
  const found = await stripe("prices", { "lookup_keys[]": PRICE_KEY, active: "true", limit: 1 }, "GET");
  if (found.data?.length) return found.data[0].id;
  const product = await stripe("products", { name: "Načti.me Pro", description: "Neomezené dynamické QR kódy, statistiky, AI návrhy a fotky. Bez podpisu Načti.me." });
  const price = await stripe("prices", { product: product.id, currency: "czk", unit_amount: PRICE_CZK * 100, recurring: { interval: "month" }, lookup_key: PRICE_KEY });
  return price.id;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const h = {
    "Access-Control-Allow-Origin": origin && ORIGINS.includes(origin) ? origin : SITE,
    "Access-Control-Allow-Headers": "content-type, apikey, authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json", Vary: "Origin",
  };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: h });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await db.auth.getUser(token);
  const user = auth?.user;
  if (!user) return json({ error: "unauthorized" }, 401);

  let body: { action?: string } = {};
  try { body = await req.json(); } catch { /* prázdné tělo */ }

  try {
    let { data: p } = await db.from("nacti_profiles").select("*").eq("user_id", user.id).maybeSingle();
    if (!p) {
      ({ data: p } = await db.from("nacti_profiles").insert({ user_id: user.id, email: user.email }).select().single());
    }

    if (body.action === "checkout") {
      let customer = p.stripe_customer_id;
      if (!customer) {
        const c = await stripe("customers", { email: user.email, metadata: { user_id: user.id } });
        customer = c.id;
        await db.from("nacti_profiles").update({ stripe_customer_id: customer }).eq("user_id", user.id);
      }
      const s = await stripe("checkout/sessions", {
        mode: "subscription", customer, client_reference_id: user.id, locale: "cs", allow_promotion_codes: "true",
        "line_items[0][price]": await priceId(), "line_items[0][quantity]": 1,
        success_url: `${SITE}/pro/?zaplaceno=1`, cancel_url: `${SITE}/pro/`,
      });
      return json({ url: s.url });
    }

    if (body.action === "portal") {
      if (!p.stripe_customer_id) return json({ error: "no_customer" }, 400);
      const s = await stripe("billing_portal/sessions", { customer: p.stripe_customer_id, return_url: `${SITE}/pro/` });
      return json({ url: s.url });
    }

    // status: zeptá se Stripe na aktuální předplatné
    if (p.stripe_customer_id) {
      const subs = await stripe("subscriptions", { customer: p.stripe_customer_id, status: "all", limit: 1 }, "GET");
      const sub = subs.data?.[0];
      const end = sub ? (sub.items?.data?.[0]?.current_period_end ?? sub.current_period_end) : null;
      const upd = { sub_status: sub?.status ?? null, current_period_end: end ? new Date(end * 1000).toISOString() : null, updated_at: new Date().toISOString() };
      await db.from("nacti_profiles").update(upd).eq("user_id", user.id);
      p = { ...p, ...upd };
    }
    const { data: pro } = await db.rpc("nacti_is_pro", { uid: user.id });
    return json({ pro: !!pro, status: p.sub_status, periodEnd: p.current_period_end, email: user.email, priceCzk: PRICE_CZK });
  } catch (e) {
    const msg = (e as Error).message;
    return json({ error: msg === "not_configured" ? "not_configured" : "stripe_error", detail: msg }, msg === "not_configured" ? 503 : 502);
  }
});
