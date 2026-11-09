import type { Config } from "@netlify/functions"

// Reads a poster / ticket email / screenshot with Claude and returns the JSON the client asked for.
// The prompt comes from the client (it carries today's date and the field rules); the key never leaves the server.
export default async (req: Request) => {
  const key = Netlify.env.get("ANTHROPIC_API_KEY")
  if (!key) return Response.json({ error: "reader not configured" }, { status: 503 })
  let body: any
  try { body = await req.json() } catch { return Response.json({ error: "bad json" }, { status: 400 }) }
  const image = String(body.image || ""), prompt = String(body.prompt || "")
  if (!image || image.length > 5_500_000 || !prompt) return Response.json({ error: "bad input" }, { status: 400 })
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
export const config: Config = { path: "/api/read", method: ["POST"] }
