import type { Config } from "@netlify/functions"

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

  const prompt = `Du hjälper appen Bento att spara kommande evenemang (konsert, teater, bio, sport, resa, mat, fest).
Idag är det ${today}. Användaren bor i Stockholm om inget annat framgår.
Användaren skrev: ${JSON.stringify(text)}
${seen ? `Från ett foto lästes: ${JSON.stringify(seen)}` : ""}

Sök på webben och ta reda på vilket/vilka verkliga evenemang det gäller. Hitta officiell sida eller biljettsida, plats, stad och kommande datum.
Är det en lokal (t.ex. "Dramaten 19:30") eller något vagt: föreslå de mest troliga kommande föreställningarna där, gärna med den tid som angavs.
Är det en film: svensk biopremiär (dateKind "fran"). En föreställning med många speldagar: premiär eller första datum + endDate, dateKind "period", och lista några kommande speldagar i "dates".
Gissa aldrig datum som inte står någonstans; lämna då date tomt och dateKind "okant".

Svara ENDAST med JSON:
{"candidates":[{"title":"","category":"konsert|teater|bio|resa|sport|mat|fest|annat","venue":"","city":"","date":"YYYY-MM-DD","dateKind":"exakt|fran|period|okant","endDate":"","time":"HH:MM","dates":["YYYY-MM-DD"],"url":"https://officiell eller biljettsida","pages":["upp till 3 andra url:er med bra bild, t.ex. filmbolag, teater, Wikipedia"],"why":"max 8 ord, varför det passar","note":"max 20 ord"}],"question":"en kort följdfråga om något är oklart, annars tom"}
Högst 3 kandidater, bästa först. Svenska.`

  const messages: any[] = [{ role: "user", content: prompt }]
  const model = Netlify.env.get("ANTHROPIC_SUGGEST_MODEL") || Netlify.env.get("ANTHROPIC_MODEL") || "claude-sonnet-5-5"
  let out = ""
  for (let turn = 0; turn < 3; turn++) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model, max_tokens: 1800, messages,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4, user_location: { type: "approximate", city: "Stockholm", country: "SE", timezone: "Europe/Stockholm" } }],
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
  return Response.json({ candidates: cands, question: String(data.question || "") })
}

export const config: Config = { path: "/api/suggest", method: ["POST"] }
