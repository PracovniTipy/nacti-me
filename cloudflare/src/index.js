// Načti.me API na Cloudflare Workers.
// Fotky (R2), AI návrhy, dynamické kódy se statistikami (D1) a předplatné Pro přes Stripe.
// Přihlášení bez e-mailu a hesla: po zaplacení dostane zařízení tajný token,
// na další zařízení se přenese naskenováním QR kódu z dashboardu.

const SITE = "https://nacti.me";
const ORIGINS = ["https://nacti.me", "https://www.nacti.me", "http://localhost", "https://localhost", "capacitor://localhost"];
const FREE_AI_DAILY = 3;
const FREE_UPLOADS_DAILY = 60;
const PRICE_KEY = "nacti_pro_monthly";
const PRICE_CZK = 99;
const DAY = 864e5;
const BOT = /bot|crawl|spider|preview|facebookexternalhit|slurp|headless|curl|wget|python/i;

// ---------------- pomocné ----------------
function cors(req) {
  const o = req.headers.get("origin") || "";
  const ok = ORIGINS.includes(o) || /^http:\/\/localhost:\d+$/.test(o) || /^http:\/\/127\.0\.0\.1:\d+$/.test(o);
  return {
    "Access-Control-Allow-Origin": ok ? o : SITE,
    "Access-Control-Allow-Headers": "content-type, authorization",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
const json = (req, o, s = 200, extra = {}) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...cors(req), "Content-Type": "application/json", "Cache-Control": "no-store", ...extra } });
const err = (req, code, s) => json(req, { error: code }, s);
const now = () => Date.now();
const today = () => new Date().toISOString().slice(0, 10);
const ip = (req) => req.headers.get("cf-connecting-ip") || "unknown";
const clip = (v, n) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");

function rand(n, alphabet) {
  const a = alphabet || "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return [...crypto.getRandomValues(new Uint8Array(n))].map((v) => a[v % a.length]).join("");
}
async function sha(s) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
function device(ua) {
  if (/iphone|ipad|ipod/i.test(ua)) return "iPhone";
  if (/android/i.test(ua)) return "Android";
  if (/windows|macintosh|linux/i.test(ua)) return "Počítač";
  return "Ostatní";
}
async function hit(env, kind, who, limit) {
  const row = await env.DB.prepare(
    "INSERT INTO usage (kind, ip, day, n) VALUES (?1, ?2, ?3, 1) ON CONFLICT (kind, ip, day) DO UPDATE SET n = n + 1 RETURNING n"
  ).bind(kind, who, today()).first();
  return row.n <= limit;
}

// ---------------- účet ----------------
async function account(req, env) {
  const t = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (t.length < 20) return null;
  return env.DB.prepare("SELECT a.* FROM tokens t JOIN accounts a ON a.id = t.account_id WHERE t.hash = ?1").bind(await sha(t)).first();
}
const isPro = (a) => !!a && ["active", "trialing", "past_due"].includes(a.sub_status) && (!a.period_end || a.period_end > now() - 3 * DAY);
async function newToken(env, accountId) {
  const t = rand(40);
  await env.DB.prepare("INSERT INTO tokens (hash, account_id, created_at) VALUES (?1, ?2, ?3)").bind(await sha(t), accountId, now()).run();
  return t;
}

// ---------------- Stripe ----------------
function form(obj, prefix = "") {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v === undefined || v === null) continue;
    if (typeof v === "object") out.push(...form(v, key));
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out;
}
async function stripe(env, path, params, method) {
  if (!env.STRIPE_SECRET_KEY) throw new Error("not_configured");
  method = method || (params ? "POST" : "GET");
  const qs = method === "GET" && params ? "?" + form(params).join("&") : "";
  const r = await fetch(`${env.STRIPE_API_BASE || "https://api.stripe.com"}/v1/${path}${qs}`, {
    method,
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: method === "POST" && params ? form(params).join("&") : undefined,
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || "stripe_error");
  return j;
}
async function priceId(env) {
  const found = await stripe(env, "prices", { "lookup_keys[]": PRICE_KEY, active: "true", limit: 1 }, "GET");
  if (found.data?.length) return found.data[0].id;
  const product = await stripe(env, "products", { name: "Načti.me Pro", description: "Neomezené dynamické QR kódy, statistiky, AI návrhy a fotky. Bez podpisu Načti.me." });
  const price = await stripe(env, "prices", { product: product.id, currency: "czk", unit_amount: PRICE_CZK * 100, recurring: { interval: "month" }, lookup_key: PRICE_KEY });
  return price.id;
}
async function refresh(env, a) {
  if (!a?.stripe_customer) return a;
  const subs = await stripe(env, "subscriptions", { customer: a.stripe_customer, status: "all", limit: 1 }, "GET");
  const sub = subs.data?.[0];
  const end = sub ? (sub.items?.data?.[0]?.current_period_end ?? sub.current_period_end) : null;
  const upd = { sub_status: sub?.status ?? null, period_end: end ? end * 1000 : null };
  await env.DB.prepare("UPDATE accounts SET sub_status = ?1, period_end = ?2 WHERE id = ?3").bind(upd.sub_status, upd.period_end, a.id).run();
  return { ...a, ...upd };
}

// ---------------- AI návrh ----------------
// Najde v odpovědi první celý JSON objekt (i když model přidá text okolo nebo ```json bloky).
function parseJson(t) {
  t = String(t || "").replace(/```(?:json)?/gi, "");
  for (let i = t.indexOf("{"); i >= 0; i = t.indexOf("{", i + 1)) {
    let depth = 0, str = false, esc = false;
    for (let j = i; j < t.length; j++) {
      const c = t[j];
      if (str) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') str = false; continue; }
      if (c === '"') str = true; else if (c === "{") depth++; else if (c === "}" && --depth === 0) {
        try { const o = JSON.parse(t.slice(i, j + 1)); if (o && typeof o === "object") return o; } catch {}
        break;
      }
    }
  }
  return null;
}
const LAYOUTS = { card: ["monogram", "editorial", "ticket", "swiss", "aura", "split"], a6: ["editorial", "block", "frame", "aura"], sticker: ["badge", "ring"] };
const HINTS = {
  monogram: "obří iniciály přes okraj, elegantní", editorial: "časopisecký styl, velký nadpis, tenká linka",
  ticket: "vstupenka s odtrhávací částí", swiss: "švýcarský styl, jméno svisle, přísná mřížka",
  aura: "měkký barevný přechod se zrnem", split: "barevný pruh s QR, text vlevo",
  block: "barevný blok nahoře, QR přes hranu", frame: "elegantní rámeček, vše na střed",
  badge: "barevný čtverec s bílým polem pro QR", ring: "bílá se silným barevným rámem",
};
const DISPLAY = ["Fraunces", "Bodoni Moda", "Instrument Serif", "Unbounded", "Syne", "Bricolage Grotesque"];
const TEXT = ["Geist", "Manrope", "DM Mono"];

// Bezpečná SVG grafika od AI: jen kreslicí prvky, žádné skripty ani odkazy ven.
function cleanSvg(svg) {
  if (typeof svg !== "string") return "";
  let t = svg.slice(0, 80000);
  t = t.replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\s*(script|foreignObject|iframe|object|embed|image|audio|video|a)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|foreignObject|iframe|object|embed|image|audio|video)\b[^>]*\/?>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(xlink:)?href\s*=\s*("(?!#)[^"]*"|'(?!#)[^']*')/gi, "")
    .replace(/url\(\s*['"]?(?!#)[^)]*\)/gi, "none")
    .replace(/@import[^;]*;?/gi, "");
  if (!/^<svg[\s>]/i.test(t.trim()) || !/<\/svg>\s*$/i.test(t.trim())) return "";
  return t.trim();
}
// Slova, která zákazník zakázal („bez slova sklo“, „nepiš sklo“)
function forbidden(brief) {
  const out = [];
  const re = /(?:bez\s+slov[ae]?|nepiš|nepis|nepoužívej\s+slovo|nepouzivej\s+slovo|ať\s+tam\s+není|at\s+tam\s+neni)\s+["„“']?([\p{L}-]{3,})/giu;
  let m; while ((m = re.exec(brief))) out.push(m[1].toLowerCase());
  return out;
}
const hasWord = (text, words) => words.some((w) => String(text || "").toLowerCase().includes(w.slice(0, Math.max(3, w.length - 1))));

async function design(req, env) {
  if (!env.ANTHROPIC_API_KEY) return err(req, "not_configured", 503);
  let body; try { body = await req.json(); } catch { return err(req, "bad_json", 400); }
  // Vizitky na míru od AI (s vlastní kresbou) jsou výhoda Načti.me Pro
  const a = await account(req, env);
  if (!isPro(a)) return err(req, "pro_required", 402);
  // ochrana proti zneužití: max. 200 návrhů denně na účet
  if (!(await hit(env, "ai", "acct:" + a.id, 200))) return err(req, "rate_limited", 429);
  const refund = () => env.DB.prepare("UPDATE usage SET n = n - 1 WHERE kind = 'ai' AND ip = ?1 AND day = ?2 AND n > 0").bind("acct:" + a.id, today()).run();

  const format = LAYOUTS[body?.format] ? body.format : "card";
  const brief = clip(body?.brief, 600);
  const info = {
    jmeno: clip(body?.info?.name, 80), pozice: clip(body?.info?.title, 80), firma: clip(body?.info?.org, 80),
    web: clip(body?.info?.web, 120), druh: clip(body?.info?.kind, 30), obsah: clip(body?.info?.summary, 120),
  };
  const c = body?.current && typeof body.current === "object" ? body.current : null;
  const current = c ? JSON.stringify({ layout: clip(c.layout, 20), bg: clip(c.bg, 7), ink: clip(c.ink, 7), accent: clip(c.accent, 7), display: clip(c.display, 30), text: clip(c.text, 30), upper: !!c.upper, nameScale: +c.nameScale || 1, textScale: +c.textScale || 1 }) : "";
  const avoid = Array.isArray(body?.avoid) ? body.avoid.filter((l) => LAYOUTS[format].includes(l)).slice(0, 5) : [];
  const names = { card: "vizitka 85×55 mm", a6: "kartička A6 105×148 mm (stojánek, leták)", sticker: "samolepka 50×50 mm" };
  const VB = { card: "0 0 850 550", a6: "0 0 1050 1480", sticker: "0 0 500 500" }[format];
  const zone = {
    card: "Text (jméno, údaje) je vlevo zhruba v 60 % šířky, QR kód v bílém čtverci vpravo. Výrazné prvky motivu dej hlavně k okrajům a doprava; v textové zóně drž motiv jemný (nízký kontrast vůči bg), aby text zůstal perfektně čitelný.",
    a6: "Nadpis je nahoře, QR kód uprostřed až dole v bílém čtverci, text pod ním. Výrazné prvky motivu dej k okrajům a do rohů.",
    sticker: "QR kód je uprostřed v bílém poli. Motiv patří k okrajům a do rámu.",
  }[format];
  const ban = forbidden(brief);
  const prompt = `Jsi špičkový grafický designér a ilustrátor. Navrhni na míru tiskovinu: ${names[format]} s QR kódem.
Údaje: ${JSON.stringify(info)}
PŘÁNÍ ZÁKAZNÍKA (ZÁVAZNÉ, splň ho doslova a celé): ${brief || "(nic neuvedl, odvoď styl z oboru a údajů)"}
${ban.length ? `ZAKÁZANÁ SLOVA – nesmí se objevit nikde v textech (headline, tagline): ${ban.join(", ")}.` : ""}
Pravidla:
- Barvy z přání použij přesně (pozadí → bg, text → ink, detaily → accent). Velikost jména/údajů: nameScale 0.6–1.4, textScale 0.7–1.4. Styl, písmo a velká písmena dodrž.
- Když zákazník chce motiv, obrázek, vzor nebo náladu (např. rozbité sklo, vlny, hory, květiny, mramor, neon), NAKRESLI ho jako SVG grafiku pozadí. Když motiv nechce, nakresli jemný abstraktní prvek, který sedí k oboru, nebo SVG vynech.
- SVG: viewBox="${VB}", celé pozadí včetně podkladové barvy bg, jen vektorové tvary (path, polygon, line, circle, rect, linearGradient, radialGradient, filter s feTurbulence/feGaussianBlur). Žádný text, žádné obrázky, žádné externí odkazy. Do 7 kB.
- ${zone}
- "motif" = záložní motiv z knihovny aplikace, kdyby se SVG nepovedlo${body?.motifs ? ": " + (Array.isArray(body.motifs) ? body.motifs.filter((m) => Array.isArray(m) && /^[a-z]{2,12}$/.test(m[0])).map((m) => m[0]).join(", ") : "") : ""}, nebo "none".
${current ? "- Současný návrh: " + current + ". Pokud zákazník chce jen úpravu, uprav tento návrh a zbytek ponech." : ""}
- Rozvržení: ${LAYOUTS[format].map((l) => `${l} (${HINTS[l]})`).join("; ")}. ${format === "card" ? "S výrazným motivem nejlépe sedí editorial nebo swiss." : ""}
${avoid.length && !brief ? "- Nepoužij rozvržení: " + avoid.join(", ") + "." : ""}
- Písma pro nadpis: ${DISPLAY.join(", ")}. Písma pro údaje: ${TEXT.join(", ")}.
- ${format === "card" ? "headline = jméno osoby beze změny. tagline = krátký slogan česky do 36 znaků, nebo prázdný (když si nejsi jistý, nech prázdný)." : "headline = krátká česká výzva do 28 znaků. tagline = doplňující věta česky do 40 znaků, nebo prázdný."}
- Nevymýšlej žádné kontaktní ani platební údaje.
Odpověz PŘESNĚ v tomto tvaru: nejdřív JSON na jednom řádku, pak SVG.
{"layout":"…","bg":"#rrggbb","ink":"#rrggbb","accent":"#rrggbb","accent2":"#rrggbb","display":"…","text":"…","upper":true|false,"nameScale":1,"textScale":1,"artOpacity":1,"motif":"…","headline":"…","tagline":"…","why":"jedna věta česky, co jste podle přání udělal"}
<svg …>…</svg>`;

  const r = await fetch(`${env.ANTHROPIC_API_BASE || "https://api.anthropic.com"}/v1/messages`, {
    method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: env.AI_MODEL || "claude-sonnet-5-5", max_tokens: 6000, messages: [{ role: "user", content: prompt }] }),
  });
  if (!r.ok) {
    const t = await r.text(); console.error(t);
    let why = ""; try { const e = JSON.parse(t).error; why = `${r.status} ${e?.type || ""}: ${e?.message || ""}`.slice(0, 200); } catch { why = String(r.status); }
    await refund();
    return json(req, { error: "ai_failed", detail: why }, 502);
  }
  const out = await r.json();
  const raw = (out?.content || []).map((x) => x.text || "").join("");
  const svgAt = raw.search(/<svg[\s>]/i);
  const d = parseJson(svgAt > 0 ? raw.slice(0, svgAt) : raw);
  if (!d) {
    console.error("AI bez JSON:", raw.slice(0, 500), out?.stop_reason);
    await refund();
    return json(req, { error: "ai_failed", detail: `bad_json ${out?.stop_reason || ""}: ${raw.slice(0, 160)}` }, 502);
  }
  const svg = svgAt >= 0 ? (raw.slice(svgAt).match(/<svg[\s\S]*<\/svg>/i) || [""])[0] : "";
  d.art = cleanSvg(svg);
  if (ban.length) { if (hasWord(d.tagline, ban)) d.tagline = ""; if (format !== "card" && hasWord(d.headline, ban)) d.headline = ""; }
  return json(req, d);
}

// ---------------- fotky ----------------
const PHOTO_ID = /^[A-Za-z0-9]{8,32}$/;
async function putPhoto(req, env, id) {
  if (!PHOTO_ID.test(id)) return err(req, "bad_id", 400);
  if (!/^image\/(jpeg|png|webp)$/.test(req.headers.get("content-type") || "")) return err(req, "bad_type", 415);
  const len = +(req.headers.get("content-length") || 0);
  if (len > 2.5e6) return err(req, "too_big", 413);
  const a = await account(req, env);
  if (!isPro(a) && !(await hit(env, "upload", ip(req), FREE_UPLOADS_DAILY))) return err(req, "rate_limited", 429);
  if (await env.PHOTOS.head(id + ".jpg")) return err(req, "exists", 409);
  const buf = await req.arrayBuffer();
  if (buf.byteLength > 2.5e6) return err(req, "too_big", 413);
  await env.PHOTOS.put(id + ".jpg", buf, { httpMetadata: { contentType: req.headers.get("content-type"), cacheControl: "public, max-age=31536000, immutable" } });
  return json(req, { ok: true, url: new URL(req.url).origin + "/f/" + id }, 201);
}
async function getPhoto(req, env, id) {
  if (!PHOTO_ID.test(id)) return new Response("Nenalezeno", { status: 404 });
  const o = await env.PHOTOS.get(id + ".jpg");
  if (!o) return new Response("Nenalezeno", { status: 404, headers: cors(req) });
  return new Response(o.body, { headers: { ...cors(req), "Content-Type": o.httpMetadata?.contentType || "image/jpeg", "Cache-Control": "public, max-age=31536000, immutable", ETag: o.httpEtag } });
}

// ---------------- dynamický kód ----------------
const CODE_ID = /^[A-Za-z0-9]{7}$/;
async function resolve(req, env, ctx, id) {
  if (!CODE_ID.test(id)) return err(req, "not_found", 404);
  const c = await env.DB.prepare("SELECT target, active FROM codes WHERE id = ?1").bind(id).first();
  if (!c) return err(req, "not_found", 404);
  if (!c.active) return err(req, "paused", 410);
  const ua = req.headers.get("user-agent") || "";
  if (!BOT.test(ua)) {
    const country = (req.cf?.country || req.headers.get("cf-ipcountry") || "").toUpperCase().slice(0, 2) || null;
    ctx.waitUntil(env.DB.prepare("INSERT INTO scans (code_id, at, device, country) VALUES (?1, ?2, ?3, ?4)").bind(id, now(), device(ua), country).run());
  }
  if (new URL(req.url).searchParams.has("go")) return Response.redirect(c.target, 302);
  return json(req, { url: c.target });
}

function cleanUrl(u) {
  u = (typeof u === "string" ? u : "").trim(); if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  try { const x = new URL(u); return /^https?:$/.test(x.protocol) && x.hostname.includes(".") && u.length <= 2000 ? u : null; } catch { return null; }
}
const scanRow = (s) => ({ code_id: s.code_id, at: new Date(s.at).toISOString(), device: s.device, country: s.country });

// ---------------- router ----------------
export default {
  async fetch(req, env, ctx) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
    const url = new URL(req.url), p = url.pathname.replace(/\/+$/, "") || "/", M = req.method;
    let m;
    try {
      if (p === "/" && M === "GET") return json(req, { ok: true, app: "Načti.me" });
      if (p === "/design" && M === "POST") return design(req, env);
      if ((m = p.match(/^\/photo\/([^/]+)$/)) && M === "PUT") return putPhoto(req, env, m[1]);
      if ((m = p.match(/^\/f\/([^/]+)$/)) && M === "GET") return getPhoto(req, env, m[1]);
      if ((m = p.match(/^\/q\/([^/]+)$/)) && M === "GET") return resolve(req, env, ctx, m[1]);

      // ---- Pro ----
      if (p === "/pro/checkout" && M === "POST") {
        const a = await account(req, env);
        const params = {
          mode: "subscription", locale: "cs", allow_promotion_codes: "true",
          "line_items[0][price]": await priceId(env), "line_items[0][quantity]": 1,
          success_url: `${SITE}/pro/?s={CHECKOUT_SESSION_ID}`, cancel_url: `${SITE}/pro/`,
        };
        if (a?.stripe_customer) params.customer = a.stripe_customer;
        if (a) params.client_reference_id = a.id;
        const s = await stripe(env, "checkout/sessions", params);
        return json(req, { url: s.url });
      }
      if (p === "/pro/claim" && M === "POST") {
        const { session_id } = await req.json().catch(() => ({}));
        if (!/^cs_[A-Za-z0-9_]+$/.test(session_id || "")) return err(req, "bad_session", 400);
        const used = await env.DB.prepare("SELECT 1 FROM claims WHERE session_id = ?1").bind(session_id).first();
        if (used) return err(req, "already_used", 409);
        const s = await stripe(env, `checkout/sessions/${session_id}`, null, "GET");
        if (s.status !== "complete" || !s.customer) return err(req, "not_paid", 402);
        const email = s.customer_details?.email || null;
        let a = await env.DB.prepare("SELECT * FROM accounts WHERE stripe_customer = ?1").bind(s.customer).first();
        if (!a && s.client_reference_id) a = await env.DB.prepare("SELECT * FROM accounts WHERE id = ?1").bind(s.client_reference_id).first();
        if (!a) {
          a = { id: rand(16), email, stripe_customer: s.customer };
          await env.DB.prepare("INSERT INTO accounts (id, email, stripe_customer, created_at) VALUES (?1, ?2, ?3, ?4)").bind(a.id, email, s.customer, now()).run();
        } else if (!a.stripe_customer) {
          await env.DB.prepare("UPDATE accounts SET stripe_customer = ?1, email = COALESCE(email, ?2) WHERE id = ?3").bind(s.customer, email, a.id).run();
          a.stripe_customer = s.customer;
        }
        await env.DB.prepare("INSERT INTO claims (session_id, account_id, at) VALUES (?1, ?2, ?3)").bind(session_id, a.id, now()).run();
        a = await refresh(env, a);
        return json(req, { token: await newToken(env, a.id), pro: isPro(a), email: a.email });
      }
      if (p === "/pro/redeem" && M === "POST") {
        const { code } = await req.json().catch(() => ({}));
        if (!/^[A-Za-z0-9]{10}$/.test(code || "")) return err(req, "bad_code", 400);
        const t = await env.DB.prepare("DELETE FROM transfers WHERE code = ?1 RETURNING account_id, expires").bind(code).first();
        if (!t || t.expires < now()) return err(req, "expired", 410);
        return json(req, { token: await newToken(env, t.account_id) });
      }

      // vše níže vyžaduje přihlášení
      const a = await account(req, env);
      if (!a) return err(req, "unauthorized", 401);

      if (p === "/pro/status" && M === "GET") {
        let b = a; try { b = await refresh(env, a); } catch (e) { if (e.message === "not_configured") return err(req, "not_configured", 503); }
        return json(req, { pro: isPro(b), status: b.sub_status, periodEnd: b.period_end ? new Date(b.period_end).toISOString() : null, email: b.email, priceCzk: PRICE_CZK });
      }
      if (p === "/pro/portal" && M === "POST") {
        if (!a.stripe_customer) return err(req, "no_customer", 400);
        const s = await stripe(env, "billing_portal/sessions", { customer: a.stripe_customer, return_url: `${SITE}/pro/` });
        return json(req, { url: s.url });
      }
      if (p === "/pro/device" && M === "POST") {
        const code = rand(10);
        await env.DB.prepare("DELETE FROM transfers WHERE expires < ?1").bind(now()).run();
        await env.DB.prepare("INSERT INTO transfers (code, account_id, expires) VALUES (?1, ?2, ?3)").bind(code, a.id, now() + 10 * 60e3).run();
        return json(req, { code, url: `${SITE}/pro/?k=${code}`, expiresIn: 600 });
      }
      if (p === "/pro/logout" && M === "POST") {
        const t = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
        await env.DB.prepare("DELETE FROM tokens WHERE hash = ?1").bind(await sha(t)).run();
        return json(req, { ok: true });
      }

      // ---- kódy ----
      if (p === "/codes" && M === "GET") {
        const { results: codes } = await env.DB.prepare("SELECT id, name, target, active, created_at FROM codes WHERE account_id = ?1 ORDER BY created_at DESC").bind(a.id).all();
        const since = +(url.searchParams.get("since") || 0) || now() - 180 * DAY;
        let scans = [];
        if (codes.length) {
          const order = url.searchParams.has("since") ? "ASC" : "DESC";
          const lim = url.searchParams.has("since") ? 50 : 50000;
          ({ results: scans } = await env.DB.prepare(
            `SELECT s.code_id, s.at, s.device, s.country FROM scans s JOIN codes c ON c.id = s.code_id WHERE c.account_id = ?1 AND s.at > ?2 ORDER BY s.at ${order} LIMIT ${lim}`
          ).bind(a.id, since).all());
        }
        return json(req, { codes: codes.map((c) => ({ ...c, active: !!c.active, created_at: new Date(c.created_at).toISOString() })), scans: scans.map(scanRow) });
      }
      if (p === "/codes" && M === "POST") {
        if (!isPro(a)) return err(req, "pro_required", 402);
        const b = await req.json().catch(() => ({}));
        const name = clip(b.name, 80), target = cleanUrl(b.target), id = CODE_ID.test(b.id || "") ? b.id : rand(7);
        if (!name || !target) return err(req, "invalid", 400);
        try {
          await env.DB.prepare("INSERT INTO codes (id, account_id, name, target, active, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, 1, ?5, ?5)").bind(id, a.id, name, target, now()).run();
        } catch { return err(req, "exists", 409); }
        return json(req, { id }, 201);
      }
      if ((m = p.match(/^\/codes\/([A-Za-z0-9]{7})$/)) && (M === "PATCH" || M === "DELETE")) {
        const c = await env.DB.prepare("SELECT * FROM codes WHERE id = ?1 AND account_id = ?2").bind(m[1], a.id).first();
        if (!c) return err(req, "not_found", 404);
        if (M === "DELETE") { await env.DB.prepare("DELETE FROM codes WHERE id = ?1").bind(c.id).run(); return json(req, { ok: true }); }
        const b = await req.json().catch(() => ({}));
        if ((b.name !== undefined || b.target !== undefined) && !isPro(a)) return err(req, "pro_required", 402);
        const name = b.name !== undefined ? clip(b.name, 80) : c.name;
        const target = b.target !== undefined ? cleanUrl(b.target) : c.target;
        if (!name || !target) return err(req, "invalid", 400);
        const active = b.active !== undefined ? (b.active ? 1 : 0) : c.active;
        await env.DB.prepare("UPDATE codes SET name = ?1, target = ?2, active = ?3, updated_at = ?4 WHERE id = ?5").bind(name, target, active, now(), c.id).run();
        return json(req, { ok: true });
      }
      return err(req, "not_found", 404);
    } catch (e) {
      const msg = e?.message || "error";
      console.error(msg);
      if (msg === "not_configured") return err(req, "not_configured", 503);
      return json(req, { error: "server_error", detail: msg.slice(0, 200) }, 500);
    }
  },
};
