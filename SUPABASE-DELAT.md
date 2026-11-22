# Delat Supabase-projekt: Bento och PaxaListan

Version 4 · 2026-11-22 · Båda chattarna läser och uppdaterar den här filen. Höj versionen överst vid ändring.

Projekt: **bentoevent** (abkjjgegtryxwtuyuife, eu-north-1). Gratisnivån tillåter två aktiva projekt (MinLista och bentoevent), därför delar apparna det här.

## Viktigt i v4: projektet pausades
- Projektet var pausat (INACTIVE) den 22 november och startades igen samma dag. Under pausen var både Bento och PaxaListan utan databas.
- Bento har nu en schemalagd Netlify-funktion (`keepalive`, dagligen 05:17 UTC) som gör ett litet läsanrop så att projektet inte pausas igen. PaxaListan behöver inte göra något.
- Märker någon av chattarna att databasen inte svarar: kontrollera projektets status först.

## Bento äger
- Tabeller: `lists`, `list_members`, `events`
- Funktioner: `is_member`, `create_list`, `join_list`, `rotate_invite`, `touch_updated_at`, `delete_account` (tar bort den inloggades Bento-konto; ägda listor med andra medlemmar går över till den som gick med först, övriga raderas; sist raderas raden i `auth.users`)
- Gemensam katalog och cache för AI-förslag (v3): tabellerna `bento_catalog`, `bento_suggest_cache` och `bento_secret`, och funktionerna `bento_norm`, `bento_ok`, `bento_catalog_find`, `bento_catalog_put`, `bento_cache_get`, `bento_cache_put`. RLS är på utan policys, så tabellerna går inte att läsa direkt. Funktionerna kräver en serverhemlighet som bara Bentos Netlify-funktioner har (`BENTO_CATALOG_SECRET`).
- Nytt i v4, publika delningssidor: tabellen `bento_public_events` (bara allmänna fakta om ett event: titel, datum, tid, plats, länk, liten bild, antal sparningar) och funktionerna `bento_publish`, `bento_public_get`, `bento_public_saved`. Tabellen är stängd; funktionerna är öppna för anon med validering av indata. Räknaren lämnas bara ut från fem sparningar.
- Extension (delad ändring, v3): `pg_trgm` i schemat `extensions`, för likhetssökning på titlar. Den påverkar inget som finns.
- Storage-bucket: `posters` (läsning publik, uppladdning kräver medlemskap)
- Realtime: `postgres_changes` på `public.events`, kanaler `events-<list-id>`
- Auth: Supabase Auth med e-post (länk; kod först när egen SMTP finns och mejlmallen innehåller `{{ .Token }}`). Mejlgränsen per timme gäller hela projektet, men bara Bento skickar mejl.

## PaxaListan äger
- Tabeller: `paxa_lists`, `paxa_items`, `paxa_pax`, `paxa_events`
- Funktioner: `paxa_role`, `paxa_event` (interna), `paxa_create_list`, `paxa_get_list`, `paxa_update_list`, `paxa_delete_list`, `paxa_add_item`, `paxa_update_item`, `paxa_move_item`, `paxa_delete_item`, `paxa_set_pax`, `paxa_set_pax_status`
- Ingen inloggning. All åtkomst via `security definer`-RPC som kontrollerar en länktoken. Tabellerna är stängda för anon.
- Realtime: endast broadcast, kanaler `paxa-<list-id>`. Inga `postgres_changes`.
- Storage: ingen. Miniatyrbilder sparas som data-URL i `paxa_items.thumb`.

## Regler för båda
- Allt nytt för PaxaListan får prefixet `paxa_`. Allt nytt för Bento får från och med v3 prefixet `bento_`. Ingen använder den andras prefix.
- Ingen av apparna rör den andras tabeller, funktioner, buckets eller kanaler.
- Inga `reset`, `drop schema` eller migreringar som ändrar hela `public`.
- Ändrar någon av apparna något delat (extensions, auth-inställningar, projektets region eller plan), skriv det här först.
- Bentos äldre tabeller (`lists`, `list_members`, `events`) behåller sina namn.
- Om PaxaListan inför inloggning senare: `delete_account` raderar användaren i `auth.users`. Då behöver funktionen även städa PaxaListans data, eller döpas om till `bento_delete_account`. Säg till här först.
- PaxaListan kan också använda `pg_trgm` om den behövs, den är redan påslagen.

## Övrigt
- Bento: GitHub holgerX10/BentoEvent, Netlify-projektet bentoevent, serverfunktionerna `/api/peek`, `/api/read` (Haiku först, Sonnet som reserv), `/api/suggest` (katalog → cache → Claude med webbsök), `/api/img` (hämtar affischbilder), `/e/<id>` (publik eventsida) och `keepalive` (schemalagd). Alla anrop har en gräns per IP.
- PaxaListan: GitHub holgerX10/paxalistan, Netlify-projektet paxalistan, serverfunktionerna `/api/peek` och `/api/see`.
- Varje app har en egen arbetsyta med eget utgiftstak och egen API-nyckel i Claude Console.
- Det gamla Supabase-projektet paxalistan (pifgrntfctetcuggwnob) används inte och kan raderas.
