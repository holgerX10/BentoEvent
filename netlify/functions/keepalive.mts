import type { Config } from "@netlify/functions"

// Free Supabase projects pause when nothing touches them. One small read a day keeps Bento and PaxaListan awake.
export default async () => {
  try {
    const r = await fetch("https://abkjjgegtryxwtuyuife.supabase.co/rest/v1/rpc/bento_public_get", {
      method: "POST", headers: { apikey: "sb_publishable_rIG3-FqfPFYaqXl57yEB1A_qtKWGJYp", "content-type": "application/json" },
      body: JSON.stringify({ p_id: "keepalive" }), signal: AbortSignal.timeout(8000),
    })
    console.log("keepalive", r.status)
  } catch (e) { console.log("keepalive failed", String(e)) }
}

export const config: Config = { schedule: "17 5 * * *" }
