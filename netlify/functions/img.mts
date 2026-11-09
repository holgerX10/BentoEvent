import type { Config } from "@netlify/functions"

// Fetches a public poster image so the app can crop it and keep its own copy (many sites block hotlinking).
export default async (req: Request) => {
  const u = new URL(req.url).searchParams.get("url") || ""
  let t: URL
  try { t = new URL(u); if (t.protocol !== "https:") throw 0 } catch { return new Response("bad url", { status: 400 }) }
  if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(t.hostname)) return new Response("blocked", { status: 400 })
  try {
    const r = await fetch(t.toString(), { headers: { "user-agent": "Mozilla/5.0 BentoImg/1.0", accept: "image/*" }, redirect: "follow", signal: AbortSignal.timeout(8000) })
    const ct = r.headers.get("content-type") || ""
    if (!r.ok || !/^image\/(jpeg|png|webp|gif|avif)/.test(ct)) return new Response("not an image", { status: 415 })
    const buf = await r.arrayBuffer()
    if (buf.byteLength > 4_000_000) return new Response("too large", { status: 413 })
    return new Response(buf, { headers: { "content-type": ct, "cache-control": "public, max-age=86400" } })
  } catch { return new Response("fetch failed", { status: 502 }) }
}

export const config: Config = { path: "/api/img", method: ["GET"] }
