// Fetches a public web address on behalf of a visitor without letting it reach private networks.
// Every redirect hop is checked again, and the body is cut off at maxBytes even when no length is declared.
const PRIVATE_V4 = /^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|22[4-9]\.|2[3-5]\d\.)/
const TRACKING = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid", "mc_cid", "mc_eid", "igshid"]

export function publicUrl(raw: string, httpsOnly = false): URL | null {
  let u: URL
  try { u = new URL(raw) } catch { return null }
  if (u.protocol !== "https:" && (httpsOnly || u.protocol !== "http:")) return null
  if (u.username || u.password) return null
  const h = u.hostname.toLowerCase().replace(/\.$/, "")
  if (!h.includes(".") || h === "localhost" || /\.(local|internal|localhost|lan|home|corp)$/.test(h)) return null
  if (h.startsWith("[") || h.includes(":")) return null                      // IPv6 literals: never needed for event pages
  if (/^[\d.]+$/.test(h) && (PRIVATE_V4.test(h) || !/^\d{1,3}(\.\d{1,3}){3}$/.test(h))) return null
  if (/^(0x[\da-f]+|\d+)$/i.test(h)) return null                             // 2130706433, 0x7f000001
  if (u.port && !["80", "443", "8080", "8443"].includes(u.port)) return null
  return u
}

export const stripTracking = (u: URL) => { TRACKING.forEach(p => u.searchParams.delete(p)); return u }

export async function safeFetch(raw: string, opts: { headers?: Record<string, string>, timeout?: number, httpsOnly?: boolean } = {}): Promise<Response | null> {
  let u = publicUrl(raw, opts.httpsOnly); if (!u) return null
  const signal = AbortSignal.timeout(opts.timeout ?? 7000)
  for (let hop = 0; hop < 5; hop++) {
    const r = await fetch(u.toString(), { headers: opts.headers, redirect: "manual", signal })
    if (r.status < 300 || r.status >= 400) return r
    const loc = r.headers.get("location"); if (!loc) return r
    const next = publicUrl(new URL(loc, u).toString(), opts.httpsOnly); if (!next) return null
    u = next
  }
  return null
}

export async function readCapped(r: Response, maxBytes: number): Promise<Uint8Array | null> {
  if (Number(r.headers.get("content-length") || 0) > maxBytes) return null
  if (!r.body) return new Uint8Array(await r.arrayBuffer())
  const reader = r.body.getReader(), chunks: Uint8Array[] = []; let n = 0
  for (;;) {
    const { done, value } = await reader.read(); if (done) break
    n += value.byteLength; if (n > maxBytes) { try { await reader.cancel() } catch {} ; return null }
    chunks.push(value)
  }
  const out = new Uint8Array(n); let o = 0; for (const c of chunks) { out.set(c, o); o += c.byteLength }
  return out
}
