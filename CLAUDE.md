# Jernlogg – instruksjoner for Claude

Styrketreningslogg for Felix, David og Erik. Se `SPEC.md` for krav og `CHANGELOG.md` for hva som er gjort.

## ALLTID først: sjekk tilbakemeldinger
Brukerne sender tilbakemeldinger fra profilsiden i appen. De ligger i Supabase-tabellen `docs` med `collection = 'feedback'`.
1. Hent åpne tilbakemeldinger: `node scripts/feedback.mjs list`
   (hvis nettverket blokkerer supabase.co: kjør tilsvarende fetch i nettleserkonsollen på https://jernlogg.vercel.app via Chrome)
2. Jobb på hver av dem før andre forbedringer. Tilbakemeldinger merket **KLAGE – gjør på nytt** har fått klage på en tidligere løsning («Tilbakemelding utført dårlig» i appen): les klagen(e) og de tidligere forsøkene nøye, og løs det klagen påpeker – ikke bare gjenta forrige løsning. Klager ligger i `collection = 'feedback_complaints'` (`data.feedbackId` peker på tilbakemeldingen) og skal aldri slettes eller endres.
3. Når en er implementert, testet og pushet: `node scripts/feedback.mjs done <id> "<kort beskrivelse av endringen, på norsk>"`
   – da vises den som «✓ Fikset» i appen.
4. Noter rundene i `CHANGELOG.md`.

## Dataregler (viktig)
- All data ligger i én tabell `docs (id, collection, data jsonb, created_at, updated_at, deleted)`. Ikke endre skjemaet eller kjøre migreringer.
- Nye felt i `data` skal være valgfrie med fornuftige standardverdier – gamle rader må alltid fungere.
- Sletting er myk (`deleted = true`); RLS tillater ikke DELETE. Ikke endre dette.
- Aldri skriv testdata til produksjonsdatabasen. Test lokalt med `?local=1` (localStorage-backend).

## Arbeidsflyt
- `npm run build` og `node scripts/smoke.mjs --seed <mappe>` (Playwright, mobilviewport, lokal modus) før hver push.
- Løping/rediger/slett: `node scripts/run-e2e.mjs` (rute, stoppeklokke, ufullstendige data, topplister, ukesmål, rediger/slett, import av løpetur).
- Endrer du import fra tekst: `npx tsx scripts/test-import.ts` (parser) og `node scripts/import-e2e.mjs` (hele #/import-flyten). Formatet er beskrevet i `src/lib/importText.ts` og må være bakoverkompatibelt – lenker Claude har laget skal fortsette å virke.
- Se på skjermbildene. Ingen konsollfeil, ingen horisontal scroll.
- Push til `main` → Vercel deployer automatisk til https://jernlogg.vercel.app
- Norsk bokmål i UI, mørkt tema, mobil først.

## Løping
- Se «Løping (fase 1)» i `SPEC.md`. Hjelpefunksjoner i `src/lib/runs.ts`, sider i `src/pages/Run.tsx`, `RunBoards.tsx`, `RunFeed.tsx`, `ProfileRun.tsx`.
- Fase 2 (Strava, intervaller, tredemølle) skal IKKE bygges før brukeren ber om det.

## PWA og push-varsler
- Service worker: `public/sw.js` (network-first for sider, cache-first kun for hashede `/assets/*`, push + notificationclick). Registreres bare i produksjonsbygg og ikke med `?local=1`. Bump `VERSION` ved større endringer.
- Push: Web Push/VAPID. Offentlig nøkkel i `src/config.ts` og `api/_lib.js`; privat nøkkel KUN som `VAPID_PRIVATE_KEY` i Vercel (aldri i repoet).
- Abonnementer: `collection = 'push_subscriptions'` (id `push:<hash av endpoint>`). Logg over sendte varsler (dedupe): `collection = 'push_log'`.
- Brukerinnstillinger: `profiles`-dokumentet, feltet `notify { reminders, days, hour, friends, tz }`.
- API (Vercel-funksjoner i `api/`): `push-test` (testvarsel), `notify` (kompis fullførte økt), `cron` (daglige påminnelser, `?dry=1` viser hva som ville blitt sendt), `health`.
- Planlegging: Supabase `pg_cron`-jobben `jernlogg-reminders` kaller `/api/cron` hver time (SQL i `supabase/cron.sql`), og Vercel Cron kaller den én gang i døgnet som reserve. Hver bruker får maks én påminnelse per lokale dato.
- Tester: `node scripts/test-reminders.mjs`, `node scripts/test-api.mjs`, `node scripts/pwa-check.mjs`. Ekte push må testes på https://jernlogg.vercel.app (ikke localhost).
