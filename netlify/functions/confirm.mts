import type { Config } from "@netlify/functions"
import { candidateFacts, catalogPut, sign } from "../lib/catalog.mts"

// Called when a card made from a suggestion has been saved. Only then does the event enter the shared catalog,
// and only if the suggestion is one this server produced (the signature must match).
export default async (req: Request) => {
  let body: any
  try { body = await req.json() } catch { return Response.json({ ok: false }, { status: 400 }) }
  const tok = String(body?.tok || "")
  if (!/^[a-f0-9]{64}$/.test(tok) || !body?.candidate?.title) return Response.json({ ok: false }, { status: 400 })
  const facts = candidateFacts(body.candidate)
  const want = await sign(facts)
  if (!want || want.length !== tok.length) return Response.json({ ok: false })
  let diff = 0
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ tok.charCodeAt(i)
  if (diff) return Response.json({ ok: false }, { status: 403 })
  await catalogPut([facts])
  return Response.json({ ok: true })
}

export const config: Config = { path: "/api/confirm", method: ["POST"], rateLimit: { windowLimit: 20, windowSize: 180, aggregateBy: ["ip", "domain"] } }
