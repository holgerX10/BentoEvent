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
  const model = Netlify.env.get("ANTHROPIC_MODEL") || "claude-sonnet-5-5"
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
    signal: AbortSignal.timeout(45000),
  })
  if (!r.ok) return Response.json({ error: "upstream", status: r.status }, { status: 502 })
  const j: any = await r.json()
  const text = (j.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("")
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return Response.json({ error: "no json" }, { status: 502 })
  try { return Response.json(JSON.parse(m[0])) } catch { return Response.json({ error: "parse" }, { status: 502 }) }
}

export const config: Config = { path: "/api/read", method: ["POST"] }
