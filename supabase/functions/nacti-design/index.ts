// Načti.me – AI návrh tiskoviny na míru (vizitka, kartička A6, samolepka).
// Zdarma 3 návrhy denně, Načti.me Pro bez omezení. Klíč: ANTHROPIC_API_KEY.
import { createClient } from "npm:@supabase/supabase-js@2";

const ORIGINS = ["https://nacti.me", "http://nacti.me", "https://www.nacti.me", "capacitor://localhost", "https://localhost"];
const FREE_DAILY = 3;
const LAYOUTS: Record<string, string[]> = {
  card: ["monogram", "editorial", "ticket", "swiss", "aura", "split"],
  a6: ["editorial", "block", "frame", "aura"],
  sticker: ["badge", "ring"],
};
const HINTS: Record<string, string> = {
  monogram: "obří iniciály přes okraj, elegantní", editorial: "časopisecký styl, velký nadpis, tenká linka",
  ticket: "vstupenka s odtrhávací částí", swiss: "švýcarský styl, jméno svisle, přísná mřížka",
  aura: "měkký barevný přechod se zrnem", split: "barevný pruh s QR, text vlevo",
  block: "barevný blok nahoře, QR přes hranu", frame: "elegantní rámeček, vše na střed",
  badge: "barevný čtverec s bílým polem pro QR", ring: "bílá se silným barevným rámem",
};
const DISPLAY = ["Fraunces", "Bodoni Moda", "Instrument Serif", "Unbounded", "Syne", "Bricolage Grotesque"];
const TEXT = ["Geist", "Manrope", "DM Mono"];
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const h = {
    "Access-Control-Allow-Origin": origin && ORIGINS.includes(origin) ? origin : "https://nacti.me",
    "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-user-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json", Vary: "Origin",
  };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: h });

  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ error: "not_configured" }, 503);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // Pro = bez limitu (token přihlášeného uživatele v hlavičce x-user-token)
  let pro = false;
  const ut = req.headers.get("x-user-token");
  if (ut) {
    const { data } = await db.auth.getUser(ut);
    if (data?.user) { const r = await db.rpc("nacti_is_pro", { uid: data.user.id }); pro = !!r.data; }
  }
  if (!pro) {
    const ip = (req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
    const { data: ok } = await db.rpc("nacti_ai_hit", { p_ip: ip, p_limit: FREE_DAILY });
    if (ok === false) return json({ error: "rate_limited" }, 429);
  }

  const format = LAYOUTS[body?.format] ? body.format : "card";
  const brief = clip(body?.brief, 400);
  const info = {
    jmeno: clip(body?.info?.name, 80), pozice: clip(body?.info?.title, 80), firma: clip(body?.info?.org, 80),
    web: clip(body?.info?.web, 120), druh: clip(body?.info?.kind, 30), obsah: clip(body?.info?.summary, 120),
  };
  const c = body?.current && typeof body.current === "object" ? body.current : null;
  const current = c ? JSON.stringify({ layout: clip(c.layout, 20), bg: clip(c.bg, 7), ink: clip(c.ink, 7), accent: clip(c.accent, 7), display: clip(c.display, 30), text: clip(c.text, 30), upper: !!c.upper, nameScale: +c.nameScale || 1, textScale: +c.textScale || 1 }) : "";
  const avoid = Array.isArray(body?.avoid) ? body.avoid.filter((l: string) => LAYOUTS[format].includes(l)).slice(0, 5) : [];
  const names: Record<string, string> = { card: "vizitka 85×55 mm", a6: "kartička A6 105×148 mm (stojánek, leták)", sticker: "samolepka 50×50 mm" };
  const prompt = `Jsi art director předního designového studia. Navrhni tiskovinu na míru: ${names[format]} s QR kódem.
Údaje: ${JSON.stringify(info)}
Přání zákazníka (ZÁVAZNÉ, má přednost před vším ostatním): ${brief || "(nic neuvedl, odvoď styl z oboru a údajů)"}
Když zákazník uvede barvu, použij ji přesně (pozadí → bg, text → ink, detaily → accent). Když chce větší nebo menší jméno či údaje, nastav nameScale (0.6–1.4) nebo textScale (0.7–1.4). Styl, písmo i velká písmena dodrž.
${current ? "Současný návrh: " + current + " – pokud zákazník chce jen úpravu, uprav tento návrh a zbytek ponech." : ""}
Rozvržení: ${LAYOUTS[format].map((l) => `${l} (${HINTS[l]})`).join("; ")}.
${avoid.length && !brief ? "Nepoužij rozvržení: " + avoid.join(", ") + "." : ""}
Písma pro nadpis: ${DISPLAY.join(", ")}. Písma pro údaje: ${TEXT.join(", ")}.
Když zákazník barvy neurčí, zvol paletu jako zkušený designér. Text (ink) musí být na pozadí (bg) dobře čitelný.
${format === "card" ? "headline = jméno osoby beze změny. tagline = krátký výstižný slogan česky do 36 znaků, nebo prázdný." : "headline = krátká česká výzva do 28 znaků. tagline = doplňující věta česky do 40 znaků, nebo prázdný."}
Nevymýšlej žádné kontaktní ani platební údaje.
Odpověz POUZE JSON: {"layout":"…","bg":"#rrggbb","ink":"#rrggbb","accent":"#rrggbb","accent2":"#rrggbb","display":"…","text":"…","upper":true|false,"nameScale":1,"textScale":1,"headline":"…","tagline":"…","why":"jedna věta česky, co jste podle přání udělal"}`;

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-haiku-5-5", max_tokens: 400, messages: [{ role: "user", content: prompt }] }),
  });
  if (!r.ok) { console.error(await r.text()); return json({ error: "ai_failed" }, 502); }
  const out = await r.json();
  const m = (out?.content || []).map((c: any) => c.text || "").join("").match(/\{[\s\S]*\}/);
  try { return json(JSON.parse(m![0])); } catch { return json({ error: "ai_failed" }, 502); }
});
