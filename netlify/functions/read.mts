import type { Config } from "@netlify/functions"

// Reads a poster / ticket email / screenshot with Claude and returns the card fields as JSON.
// The prompt is written here, on the server: the client only sends the image, today's date and whether it is cropped,
// so this endpoint cannot be used to run someone else's prompts on Bento's key.
const CATEGORIES = ["konsert", "teater", "bio", "resa", "sport", "mat", "fest", "annat"]
const buildPrompt = (today: string, cropped: boolean) => `Du läser en bild av en affisch, ett biljettmejl eller en skärmdump av en webbsida för ett evenemang (konsert, teater, bio, resa, sport, mat, fest). Dagens datum är ${today} (ÅÅÅÅ-MM-DD), Sverige.
Svara med ENBART ett JSON-objekt:
{"title": string, "date": "ÅÅÅÅ-MM-DD" eller null, "dateKind": "exakt" | "fran" | "period" | "okant", "endDate": "ÅÅÅÅ-MM-DD" eller null, "time": "HH:MM" eller null, "venue": string eller null, "city": string eller null, "category": en av ${JSON.stringify(CATEGORIES)}, "url": string eller null, "note": string eller null, "crop": {"x":0-1,"y":0-1,"w":0-1,"h":0-1}, "confidence": 0-1}
Regler: title = evenemangets namn (artist, film, föreställning), inte tagline. dateKind: "exakt" när datumet är en specifik speldag (konsert, match, föreställning ett visst datum); "fran" när det är en premiär eller ett släpp som sedan går löpande (bio "premiär 4 december", "exklusivt på bio 13 november", "från och med"): då är date = premiärdagen; "period" när start och slut anges; "okant" när inget datum finns. Saknas år: välj nästa gång datumet infaller efter i dag. Står bara ett slutdatum ("ends 3 Jan", "spelas till"): sätt endDate och date=null. Flera datum: första i date, resten i note. "Biopremiär 4 december" är ett datum. Hittas inget datum: date=null. venue = lokal/scen, city = stad om den syns eller är självklar (London för West End). note: kort, t.ex. support-akt, "bäst tillgänglighet i december", biljettsäljare. crop = den del av bilden som är själva affischen/omslagsbilden, som andelar av hela bilden: skär bort ramar, väggar, gardiner, statusfält och webbläsarens adressfält, men behåll hela affischen. Om hela bilden är affischen: {"x":0,"y":0,"w":1,"h":1}.${cropped ? " Bilden är redan beskuren till själva affischen och visas i högre upplösning: läs noga av små texter (datum, tid, lokal, biljettsäljare, webbadress) och sätt crop till hela bilden." : ""}`

export default async (req: Request) => {
  const key = Netlify.env.get("ANTHROPIC_API_KEY")
  if (!key) return Response.json({ error: "reader not configured" }, { status: 503 })
  let body: any
  try { body = await req.json() } catch { return Response.json({ error: "bad json" }, { status: 400 }) }
  const image = String(body.image || "")
  if (!image || image.length > 5_500_000 || !/^[A-Za-z0-9+/=]+$/.test(image.slice(0, 2000))) return Response.json({ error: "bad input" }, { status: 400 })
  const today = /^\d{4}-\d{2}-\d{2}$/.test(String(body.today || "")) ? String(body.today) : new Date().toISOString().slice(0, 10)
  const prompt = buildPrompt(today, body.cropped === true)
  // Fast model first; escalate only when it could not read the essentials
  const ask = async (model: string) => {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model, max_tokens: 700,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
          { type: "text", text: prompt + "\nSvara bara med JSON-objektet, inga kodstaket." },
        ] }],
      }),
      signal: AbortSignal.timeout(30000),
    })
    if (!r.ok) return null
    const j: any = await r.json()
    const text = (j.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("")
    const m = text.match(/\{[\s\S]*\}/); if (!m) return null
    try { return JSON.parse(m[0]) } catch { return null }
  }
  let out = await ask(Netlify.env.get("ANTHROPIC_FAST_MODEL") || "claude-haiku-5-5")
  if (!out || !out.title || (typeof out.confidence === "number" && out.confidence < 0.6)) {
    const strong = await ask(Netlify.env.get("ANTHROPIC_MODEL") || "claude-sonnet-5-5")
    if (strong && (strong.title || !out)) out = strong
  }
  if (!out) return Response.json({ error: "upstream" }, { status: 502 })
  return Response.json(out)
}
// At most 12 calls per IP in three minutes; Netlify answers 429 above that.
export const config: Config = { path: "/api/read", method: ["POST"], rateLimit: { windowLimit: 12, windowSize: 180, aggregateBy: ["ip", "domain"] } }
