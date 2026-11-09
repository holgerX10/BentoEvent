import type { Config } from "@netlify/functions"

// Reads a public event page and returns what a Bento card needs. Partial results are fine:
// the client fills the rest from the pasted text or asks the user for the one thing missing.
const UA = "Mozilla/5.0 (Linux; Android 14; Pixel 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36 BentoPeek/1.0"
const MONTHS: Record<string, number> = { jan:1, feb:2, mar:3, apr:4, maj:5, may:5, jun:6, jul:7, aug:8, sep:9, okt:10, oct:10, nov:11, dec:12 }

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).trim()
const meta = (html: string, key: string) => {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`, "i")
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, "i")
  const m = html.match(re) || html.match(re2); return m ? decode(m[1]) : ""
}
const isoDate = (v: string) => { const m = String(v || "").match(/(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[1]}-${m[2]}-${m[3]}` : "" }
const isoTime = (v: string) => { const m = String(v || "").match(/T(\d{2}):(\d{2})/); return m ? `${m[1]}:${m[2]}` : "" }

function fromJsonLd(html: string) {
  const out: any = {}
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  const walk = (n: any) => {
    if (!n || typeof n !== "object") return
    if (Array.isArray(n)) { n.forEach(walk); return }
    if (n["@graph"]) walk(n["@graph"])
    const t = String(n["@type"] || "")
    if (/Event/i.test(t) && !out.title) {
      out.title = n.name || ""
      out.date = isoDate(n.startDate); out.time = isoTime(n.startDate); out.endDate = isoDate(n.endDate)
      const loc = Array.isArray(n.location) ? n.location[0] : n.location
      if (loc) { out.venue = loc.name || ""; out.city = loc.address?.addressLocality || (typeof loc.address === "string" ? loc.address : "") }
      const img = Array.isArray(n.image) ? n.image[0] : n.image; out.image = typeof img === "string" ? img : img?.url || ""
      const offer = Array.isArray(n.offers) ? n.offers[0] : n.offers; out.ticketUrl = offer?.url || ""
      out.description = n.description || ""
      out.category = /Music|Concert/i.test(t) ? "konsert" : /Theater|Theatre|Dance/i.test(t) ? "teater" : /Screening|Movie/i.test(t) ? "bio" : /Sports/i.test(t) ? "sport" : /Food/i.test(t) ? "mat" : /Festival|Social/i.test(t) ? "fest" : ""
    }
    for (const k of Object.keys(n)) if (k !== "@graph" && typeof n[k] === "object") walk(n[k])
  }
  for (const b of blocks) { try { walk(JSON.parse(b[1].trim())) } catch {} }
  return out
}

// Swedish dates in visible text: "12 december 2026", "fre 12 dec", "2026-12-12"
function dateFromText(text: string) {
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/); if (iso) return iso[0]
  const m = text.match(/\b(\d{1,2})\.?\s+(jan|feb|mar|apr|maj|may|jun|jul|aug|sep|okt|oct|nov|dec)[a-zé]*\.?(?:\s+(20\d{2}))?/i)
  if (!m) return ""
  const d = +m[1], mo = MONTHS[m[2].toLowerCase().slice(0, 3)], now = new Date()
  let y = m[3] ? +m[3] : now.getFullYear()
  if (!m[3]) { const cand = new Date(y, mo - 1, d); if (cand.getTime() < now.getTime() - 86400000) y++ }
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

export default async (req: Request) => {
  const u = new URL(req.url).searchParams.get("url") || ""
  let target: URL
  try { target = new URL(u); if (!/^https?:$/.test(target.protocol)) throw 0 } catch { return Response.json({ error: "bad url" }, { status: 400 }) }
  if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(target.hostname)) return Response.json({ error: "blocked" }, { status: 400 })
  let html = ""
  try {
    const r = await fetch(target.toString(), { headers: { "user-agent": UA, accept: "text/html,*/*;q=0.8", "accept-language": "sv-SE,sv;q=0.9,en;q=0.7" }, redirect: "follow", signal: AbortSignal.timeout(7000) })
    const ct = r.headers.get("content-type") || ""
    if (!r.ok || !/html|xml/.test(ct)) return Response.json({ partial: true, url: u, title: "", status: r.status })
    html = (await r.text()).slice(0, 600_000)
  } catch { return Response.json({ partial: true, url: u, title: "", error: "fetch" }) }
  const ld = fromJsonLd(html)
  const ogTitle = meta(html, "og:title") || meta(html, "twitter:title") || decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, ""])[1] || "")
  const title = (ld.title || ogTitle).replace(/\s*[|–-]\s*[^|–-]{2,40}$/, "").trim()
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")
  const date = ld.date || isoDate(meta(html, "event:start_time")) || dateFromText(meta(html, "og:description") + " " + text.slice(0, 20000))
  const body = {
    url: u, title, date, time: ld.time || "", endDate: ld.endDate || "", venue: ld.venue || "", city: ld.city || "",
    image: ld.image || meta(html, "og:image") || meta(html, "twitter:image") || "",
    description: (ld.description || meta(html, "og:description") || "").slice(0, 300),
    category: ld.category || "", ticketUrl: ld.ticketUrl || "",
    partial: !(title && date),
  }
  return Response.json(body, { headers: { "cache-control": "public, max-age=3600" } })
}

export const config: Config = { path: "/api/peek", method: ["GET"] }
