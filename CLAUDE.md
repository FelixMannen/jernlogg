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
- Se på skjermbildene. Ingen konsollfeil, ingen horisontal scroll.
- Push til `main` → Vercel deployer automatisk til https://jernlogg.vercel.app
- Norsk bokmål i UI, mørkt tema, mobil først.
