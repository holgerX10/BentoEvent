// Shared catalog + suggestion cache in Supabase, reached through secret-checked RPCs.
// Without BENTO_CATALOG_SECRET everything here is a no-op and the app simply asks the AI every time.
const SB_URL = "https://abkjjgegtryxwtuyuife.supabase.co"
const SB_KEY = "sb_publishable_rIG3-FqfPFYaqXl57yEB1A_qtKWGJYp"

async function rpc(fn: string, args: Record<string, unknown>): Promise<any> {
  const secret = Netlify.env.get("BENTO_CATALOG_SECRET")
  if (!secret) return null
  try {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ p_secret: secret, ...args }),
      signal: AbortSignal.timeout(2500),
    })
    if (!r.ok) return null
    return await r.json()
  } catch { return null }
}

export const norm = (t: string) => String(t || "").toLowerCase().replace(/[^a-z0-9åäöéü]+/g, " ").trim()

export async function catalogFind(q: string, today: string) {
  const rows = await rpc("bento_catalog_find", { p_q: q, p_today: today })
  if (!Array.isArray(rows)) return []
  return rows.map((r: any) => ({
    title: r.title, category: r.category, venue: r.venue, city: r.city, date: r.date, dateKind: r.date_kind,
    endDate: r.end_date, time: r.time, dates: r.dates || [], url: r.url, images: r.images || [], hits: r.hits,
  }))
}
export const catalogPut = (items: any[]) => rpc("bento_catalog_put", { p_items: items })
export const cacheGet = (key: string) => rpc("bento_cache_get", { p_key: key })
export const cachePut = (key: string, payload: unknown) => rpc("bento_cache_put", { p_key: key, p_payload: payload })

// Trigram-ish similarity on normalized titles, used to decide whether a catalog hit is the same event
export function sameTitle(a: string, b: string) {
  const A = norm(a), B = norm(b); if (!A || !B) return 0
  if (A === B) return 1
  const grams = (s: string) => { const g = new Set<string>(); const t = `  ${s} `; for (let i = 0; i < t.length - 2; i++) g.add(t.slice(i, i + 3)); return g }
  const ga = grams(A), gb = grams(B); let inter = 0; for (const g of ga) if (gb.has(g)) inter++
  return inter / (ga.size + gb.size - inter)
}
