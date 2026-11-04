// Načti.me – dynamický kód: zapíše naskenování a vrátí cílovou adresu.
// Volá ji stránka nacti.me/q/?c=KOD. Bez přihlášení (verify_jwt = false).
import { createClient } from "npm:@supabase/supabase-js@2";

const ORIGINS = ["https://nacti.me", "http://nacti.me", "https://www.nacti.me"];
const BOT = /bot|crawl|spider|preview|facebookexternalhit|slurp|headless|curl|wget|python/i;

function device(ua: string) {
  if (/iphone|ipad|ipod/i.test(ua)) return "iPhone";
  if (/android/i.test(ua)) return "Android";
  if (/windows|macintosh|linux/i.test(ua)) return "Počítač";
  return "Ostatní";
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const h = {
    "Access-Control-Allow-Origin": origin && ORIGINS.includes(origin) ? origin : "https://nacti.me",
    "Access-Control-Allow-Headers": "content-type, apikey, authorization",
    "Content-Type": "application/json", "Cache-Control": "no-store", Vary: "Origin",
  };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });

  const id = new URL(req.url).searchParams.get("c") || "";
  if (!/^[A-Za-z0-9]{7}$/.test(id)) return new Response('{"error":"not_found"}', { status: 404, headers: h });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: code } = await db.from("nacti_codes").select("id, target, active").eq("id", id).maybeSingle();
  if (!code) return new Response('{"error":"not_found"}', { status: 404, headers: h });
  if (!code.active) return new Response('{"error":"paused"}', { status: 410, headers: h });

  const ua = req.headers.get("user-agent") || "";
  if (!BOT.test(ua)) {
    const country = (req.headers.get("cf-ipcountry") || req.headers.get("x-country") || "").toUpperCase().slice(0, 2) || null;
    await db.from("nacti_scans").insert({ code_id: id, device: device(ua), country });
  }
  return new Response(JSON.stringify({ url: code.target }), { status: 200, headers: h });
});
