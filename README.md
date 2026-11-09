# Bento (BentoEvent) – Netlify + Supabase

Statisk PWA i `public/` + två Netlify-funktioner i `netlify/functions/`.

## Deploya
    npx netlify-cli deploy --prod --site 99853edf-9099-4c1a-9084-a402ba041bc3
(eller koppla repot till projektet "bentoevent" i Netlify; publish = public, functions = netlify/functions)

## Miljövariabler (Netlify → Project configuration → Environment variables)
- `ANTHROPIC_API_KEY` – krävs för att läsa affischer med Claude (`/api/read`). Utan nyckel svarar funktionen 503 och appen hoppar över bildläsningen.
- `ANTHROPIC_MODEL` – valfritt, standard `claude-sonnet-5-5`.

## Supabase (projekt `bentoevent`, abkjjgegtryxwtuyuife)
- Authentication → URL Configuration: Site URL = `https://bentoevent.netlify.app`, lägg även till den under Redirect URLs. Annars går magic-länkarna till localhost.
- Schema och RLS ligger i migrationerna (`lists`, `list_members`, `events`, bucket `posters`, RPC `create_list`/`join_list`/`rotate_invite`).

## Bygga om index.html
`public/index.html` genereras från `source/artifact-index.html` med `python3 build.py` (lägger in Supabase-konfig och lokal supabase-js).
