import type { Config } from "@netlify/functions"
import { catalogFind, catalogPut, cacheGet, cachePut, norm, sameTitle } from "../lib/catalog.mts"

// Turns a few words, a pasted link or what Claude read off a photo into 1–3 concrete event candidates,
// using web search for dates, venue, official page and poster images. The client asks the user to pick.
const UA = "Mozilla/5.0 (Linux; Android 14; Pixel 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36 BentoPeek/1.0"

const metaImage = (html: string) => {
  const pick = (k: string) => {
    const a = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*content=["']([^"']+)["']`, "i"))
    const b = html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${k}["']`, "i"))
    return (a || b)?.[1] || ""
  }
  return pick("og:image") || pick("og:image:url") || pick("twitter:image")
}
async function ogImage(url: string): Promise<string> {
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(4500) })
    if (!r.ok) return ""
    const html = (await r.text()).slice(0, 400_000)
    let img = metaImage(html).replace(/&amp;/g, "&")
    if (img && img.startsWith("/")) img = new URL(img, r.url).toString()
    return /^https:\/\//.test(img) ? img : ""
  } catch { return "" }
}

export default async (req: Request) => {
  const key = Netlify.env.get("ANTHROPIC_API_KEY")
  if (!key) return Response.json({ error: "not configured" }, { status: 503 })
  let body: any
  try { body = await req.json() } catch { return Response.json({ error: "bad json" }, { status: 400 }) }
  const text = String(body.text || "").slice(0, 1500)
  const seen = body.seen && typeof body.seen === "object" ? body.seen : null // what was read off a photo
  const today = String(body.today || new Date().toISOString().slice(0, 10))
  if (!text && !seen) return Response.json({ error: "empty" }, { status: 400 })

  // 1. Same question today → same answer (shared across users)
  const ckey = [norm(text), seen ? norm(seen.title || "") : "", seen ? String(seen.date || "") : "", today].join("|")
  const cached = await cacheGet(ckey)
  if (cached && Array.isArray(cached.candidates) && cached.candidates.length) return Response.json({ ...cached, source: "cache" })

  // 2. A poster we have seen before → answer from the catalog, no web search
  const q = (seen && seen.title) || text
  if (q && q.length >= 3) {
    const hits = (await catalogFind(q, today)).filter(h => sameTitle(h.title, q) >= 0.55 || (seen && seen.title && norm(h.title).includes(norm(seen.title))))
    if (hits.length && (seen?.title || hits[0].images?.length)) {
      const cands = hits.slice(0, 4).map((h, i) => ({ ...h, match: i === 0, why: h.hits > 1 ? `Sparat av ${h.hits} personer` : "Från katalogen" }))
      return Response.json({ candidates: cands, question: "", source: "catalog" })
    }
  }

  // 3. Ask Claude with web search. A fully read poster only needs the official page and image → small, fast model.
  const complete = !!(seen && seen.title && (seen.date || seen.endDate) && (seen.venue || seen.city))
  const prompt = `Du hjälper appen Bento att spara kommande evenemang (konsert, teater, bio, sport, resa, mat, fest).
Idag är det ${today}. Användaren bor i Stockholm om inget annat framgår.
Användaren skrev: ${JSON.stringify(text)}
${seen ? `Från ett foto lästes: ${JSON.stringify(seen)}` : ""}

Sök på webben och ta reda på vilket/vilka verkliga evenemang det gäller. Hitta officiell sida eller biljettsida, plats, stad och kommande datum.
Är det en lokal (t.ex. "Dramaten 19:30") eller något vagt: föreslå de mest troliga kommande föreställningarna där, gärna med den tid som angavs.
Är det en film: svensk biopremiär (dateKind "fran"). En föreställning med många speldagar: premiär eller första datum + endDate, dateKind "period", och lista några kommande speldagar i "dates".
Gissa aldrig datum som inte står någonstans; lämna då date tomt och dateKind "okant".

Resor (category "resa"): titel som "Resa till X", date = avresa, endDate = hemresa, dateKind "exakt". Ingen url till turistsajter; url bara om det finns en bokning. Inga note-gissningar.
Markera med "match": true de kandidater som exakt motsvarar det användaren skrev (rätt dag, tid och plats). Andra rimliga alternativ (andra dagar, närliggande evenemang) får "match": false.
Svara ENDAST med JSON:
{"candidates":[{"match":true,"title":"","category":"konsert|teater|bio|resa|sport|mat|fest|annat","venue":"","city":"","date":"YYYY-MM-DD","dateKind":"exakt|fran|period|okant","endDate":"","time":"HH:MM","dates":["YYYY-MM-DD"],"url":"https://officiell eller biljettsida","pages":["upp till 3 andra url:er med bra bild, t.ex. filmbolag, teater, Wikipedia"],"why":"max 8 ord, varför det passar","note":"max 20 ord"}],"question":"en kort följdfråga om något är oklart, annars tom"}
Högst ${complete ? 2 : 5} kandidater, matchningar först. note bara om det är användbart för besökaren. Svenska.`

  const messages: any[] = [{ role: "user", content: prompt }]
  const model = complete ? (Netlify.env.get("ANTHROPIC_FAST_MODEL") || "claude-haiku-5-5") : (Netlify.env.get("ANTHROPIC_SUGGEST_MODEL") || "claude-sonnet-5-5")
  let out = ""
  for (let turn = 0; turn < 3; turn++) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model, max_tokens: 1800, messages,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: complete ? 2 : 4, user_location: { type: "approximate", city: "Stockholm", country: "SE", timezone: "Europe/Stockholm" } }],
      }),
      signal: AbortSignal.timeout(40000),
    })
    if (!r.ok) return Response.json({ error: "upstream", status: r.status, detail: (await r.text()).slice(0, 300) }, { status: 502 })
    const j: any = await r.json()
    out += (j.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("")
    if (j.stop_reason !== "pause_turn") break
    messages.push({ role: "assistant", content: j.content })
  }
  const m = out.match(/\{[\s\S]*\}/)
  if (!m) return Response.json({ candidates: [], question: "" })
  let data: any
  try { data = JSON.parse(m[0]) } catch { return Response.json({ candidates: [], question: "" }) }
  const cands = (Array.isArray(data.candidates) ? data.candidates : []).slice(0, 3)
  // Poster images from the official page and the extra pages, fetched in parallel
  await Promise.all(cands.map(async (c: any) => {
    const urls = [c.url, ...(Array.isArray(c.pages) ? c.pages : [])].filter((u: any) => typeof u === "string" && /^https?:\/\//.test(u)).slice(0, 4)
    const imgs = await Promise.all(urls.map(ogImage))
    c.images = [...new Set(imgs.filter(Boolean))].slice(0, 4)
    delete c.pages
  }))
  const payload = { candidates: cands, question: String(data.question || "") }
  if (cands.length) await Promise.all([cachePut(ckey, payload), catalogPut(cands.map((c: any) => ({ ...c, match: undefined, why: undefined })))])
  return Response.json({ ...payload, source: "ai" })
}

export const config: Config = { path: "/api/suggest", method: ["POST"] }
