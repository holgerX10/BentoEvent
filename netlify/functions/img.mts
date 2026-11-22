import type { Config } from "@netlify/functions"
import { safeFetch, readCapped } from "../lib/safe.mts"

// Fetches a public poster image so the app can crop it and keep its own copy (many sites block hotlinking).
export default async (req: Request) => {
  const u = new URL(req.url).searchParams.get("url") || ""
  try {
    const r = await safeFetch(u, { headers: { "user-agent": "Mozilla/5.0 BentoImg/1.0", accept: "image/*" }, timeout: 8000, httpsOnly: true })
    if (!r) return new Response("blocked", { status: 400 })
    const ct = r.headers.get("content-type") || ""
    if (!r.ok || !/^image\/(jpeg|png|webp|gif|avif)/.test(ct)) return new Response("not an image", { status: 415 })
    const buf = await readCapped(r, 4_000_000)
    if (!buf) return new Response("too large", { status: 413 })
    return new Response(buf as BodyInit, { headers: { "content-type": ct, "cache-control": "public, max-age=86400", "x-content-type-options": "nosniff" } })
  } catch { return new Response("fetch failed", { status: 502 }) }
}

// At most 90 calls per IP in three minutes; Netlify answers 429 above that.
export const config: Config = { path: "/api/img", method: ["GET"], rateLimit: { windowLimit: 90, windowSize: 180, aggregateBy: ["ip", "domain"] } }
