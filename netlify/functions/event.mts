import type { Config, Context } from "@netlify/functions"

// Public page for a shared Bento card: /e/<id>. Shows only general facts about the event.
const SB_URL = "https://abkjjgegtryxwtuyuife.supabase.co"
const SB_KEY = "sb_publishable_rIG3-FqfPFYaqXl57yEB1A_qtKWGJYp"
const CATS: Record<string, [string, string, string]> = {
  konsert: ["Konsert", "#80A1C1", "#4E6F93"], teater: ["Teater", "#C78BA8", "#7A3F62"], bio: ["Bio", "#5B6475", "#1F2533"],
  resa: ["Resa", "#F2B880", "#C2680A"], sport: ["Sport", "#7FC9A3", "#15803D"], mat: ["Mat & dryck", "#FAD4C0", "#D98060"],
  fest: ["Fest", "#F0C96B", "#C9951E"], annat: ["Annat", "#CBD5E1", "#7B8794"],
}
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!))

async function load(id: string) {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/bento_public_get`, {
      method: "POST", headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ p_id: id }), signal: AbortSignal.timeout(4000),
    })
    if (!r.ok) return null
    return await r.json()
  } catch { return null }
}

const page = (body: string, head = "", status = 200) => new Response(`<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex"><meta name="theme-color" content="#171412"><link rel="icon" href="/icon.svg" type="image/svg+xml">${head}
<link rel="preload" href="/fonts/outfit.woff2" as="font" type="font/woff2" crossorigin>
<style>
@font-face{font-family:"Manrope";src:url("/fonts/manrope.woff2") format("woff2");font-weight:200 800;font-display:swap}@font-face{font-family:"Outfit";src:url("/fonts/outfit.woff2") format("woff2");font-weight:100 900;font-display:swap}
*{box-sizing:border-box}html,body{margin:0}body{min-height:100dvh;background:#171412;color:#F6EEE4;font-family:Manrope,system-ui,sans-serif;display:grid;place-items:center;padding:20px 16px calc(20px + env(safe-area-inset-bottom))}
main{width:100%;max-width:420px;display:grid;gap:10px;animation:in 420ms cubic-bezier(.2,.9,.3,1) both}@keyframes in{from{opacity:0;transform:translateY(16px)}}
.p{aspect-ratio:1/1.02;border-radius:28px;overflow:hidden;position:relative;display:flex;align-items:flex-end;padding:24px}
.p img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.p h1{position:relative;margin:0;font:800 34px/1.05 Outfit,system-ui,sans-serif;letter-spacing:-.02em;color:#fff}
.r{display:grid;grid-template-columns:118px 1fr;gap:10px}
.d,.t{border-radius:28px;padding:16px;min-height:118px}
.d{background:var(--a);color:#fff;display:grid;place-items:center;text-align:center;align-content:center}
.d small{font:600 11px/1 ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase;opacity:.85}
.d b{font:800 56px/1 Outfit,system-ui,sans-serif;margin:2px 0}.d span{font-weight:700;font-size:15px;text-transform:uppercase}
.t{background:#FFF8EE;color:#1B1512;display:flex;flex-direction:column;justify-content:space-between;gap:8px}
.t small{font:600 11px/1 ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase;color:#6B6257}
.t b{font:800 22px/1.12 Outfit,system-ui,sans-serif;letter-spacing:-.01em;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.t span{font-size:14px;font-weight:600;color:#6B6257}
.cta{display:flex;align-items:center;justify-content:center;gap:10px;height:58px;border-radius:20px;background:#FAD4C0;color:#3B1D10;font:800 17px Outfit,system-ui,sans-serif;text-decoration:none;margin-top:6px;transition:transform 120ms}.cta:active{transform:scale(.97)}
.m{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:13px;font-weight:600;color:#B5A999;padding:4px 6px 0}
.m a{color:inherit}.br{display:inline-flex;align-items:center;gap:8px;color:#F6EEE4;font:800 16px Outfit,system-ui,sans-serif;text-decoration:none}
.mk{width:22px;height:22px;border-radius:6px;background:#FAD4C0;display:grid;grid-template-columns:1fr 1fr;gap:2px;padding:4px}.mk i{background:#3B1D10;border-radius:1.5px}.mk i:first-child{grid-row:span 2}
.e{text-align:center;display:grid;gap:16px}.e h1{font:800 26px Outfit,system-ui,sans-serif;margin:0}
@media (prefers-reduced-motion:reduce){main{animation:none}}
</style></head><body>${body}</body></html>`, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=120" } })

export default async (req: Request, context: Context) => {
  const id = String(context.params?.id || "").toLowerCase()
  const wantImg = new URL(req.url).pathname.endsWith("/img")
  const ev = /^[a-f0-9]{12}$/.test(id) ? await load(id) : null
  if (wantImg) {
    const m = ev && typeof ev.image === "string" ? ev.image.match(/^data:image\/jpeg;base64,(.+)$/) : null
    if (m) return new Response(Uint8Array.from(atob(m[1]), c => c.charCodeAt(0)) as BodyInit, { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=86400", "x-content-type-options": "nosniff" } })
    if (ev && /^https:\/\//.test(ev.image)) return Response.redirect(ev.image, 302)
    return new Response("no image", { status: 404 })
  }
  const brand = `<a class="br" href="/"><span class="mk"><i></i><i></i><i></i></span>Bento</a>`
  if (!ev) return page(`<main class="e">${brand.replace('class="br"', 'class="br" style="justify-content:center"')}<h1>Kortet finns inte kvar</h1><a class="cta" href="/">Öppna Bento</a></main>`, "<title>Bento</title>", 404)
  const [label, g0, g1] = CATS[ev.category] || CATS.annat
  const origin = new URL(req.url).origin
  const d = /^\d{4}-\d{2}-\d{2}$/.test(ev.date) ? new Date(ev.date + "T12:00:00Z") : null
  const fmt = (o: Intl.DateTimeFormatOptions) => d ? new Intl.DateTimeFormat("sv-SE", { ...o, timeZone: "UTC" }).format(d).replace(/\./g, "") : ""
  const span = d && /^\d{4}-\d{2}-\d{2}$/.test(ev.endDate) && ev.endDate > ev.date ? Math.round((Date.parse(ev.endDate) - Date.parse(ev.date)) / 864e5) + 1 : 0
  const place = [ev.venue, ev.city].filter(Boolean).join(", ")
  const sub = [ev.time ? "kl " + ev.time : "", place].filter(Boolean).join(" · ")
  const desc = [d ? fmt({ weekday: "long", day: "numeric", month: "long" }) : "", sub].filter(Boolean).join(" · ")
  const hasImg = !!ev.image
  const head = `<title>${esc(ev.title)} · Bento</title><meta property="og:type" content="website"><meta property="og:site_name" content="Bento"><meta property="og:title" content="${esc(ev.title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${origin}/e/${id}">${hasImg ? `<meta property="og:image" content="${origin}/e/${id}/img"><meta name="twitter:card" content="summary_large_image">` : `<meta property="og:image" content="${origin}/icon-512.png">`}`
  const date = d ? `<small>${esc(span ? span + " dagar" : fmt({ weekday: "long" }))}</small><b>${d.getUTCDate()}</b><span>${esc(fmt({ month: "short" }))}${d.getUTCFullYear() !== new Date().getUTCFullYear() ? " " + d.getUTCFullYear() : ""}</span>` : `<b>?</b>`
  const src = /^https:\/\//.test(ev.url) ? `<a href="${esc(ev.url)}" rel="noopener nofollow">${esc(new URL(ev.url).hostname.replace(/^www\./, ""))}</a>` : "<span></span>"
  return page(`<main>
<div class="p" style="background:linear-gradient(135deg,${g0},${g1})">${hasImg ? `<img src="/e/${id}/img" alt="">` : `<h1>${esc(ev.title)}</h1>`}</div>
<div class="r" style="--a:${g1}"><div class="d">${date}</div><div class="t"><small>${esc(label)}</small><b>${esc(ev.title)}</b><span>${esc(sub)}</span></div></div>
<a class="cta" href="/?save=${id}">Spara i Bento</a>
<div class="m">${brand}${ev.saves ? `<span>${Number(ev.saves)} har sparat</span>` : src}</div>
</main>`, head)
}

export const config: Config = { path: ["/e/:id", "/e/:id/img"], method: ["GET"], rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ["ip", "domain"] } }
