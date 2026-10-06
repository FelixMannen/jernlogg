# Jernlogg — kravspesifikasjon

Styrke- og løpelogg, startet for tre kompiser (**Felix, David og Erik**) og nå åpen for alle med grupper. Brukes på mobilen i gymmen,
mellom settene, ofte med svette fingre og 60 sekunder hvile. Alt skal gå raskt.

## Rammer
- **Stack:** Vite + React + TypeScript, ren CSS med design-tokens, ingen tunge UI-biblioteker.
- **Database:** Supabase (Postgres). Én generisk tabell `docs (id, collection, data jsonb, created_at, updated_at, deleted, synced_at)`
  slik at nye funksjoner nesten aldri krever migrering. Realtime-abonnement på tabellen. Tilgang styres av RLS (`supabase/auth.sql`).
- **Hosting:** Vercel, auto-deploy fra GitHub ved hver push.
- **Lokal modus:** samme app kjører mot en localStorage-adapter når Supabase ikke er konfigurert (`?local=1`),
  brukt til automatisert testing.
- **Brukere:** innlogging med kode på e-post (se «Innlogging og treningsgrupper»). Tidligere: navnevelger uten innlogging.
- **Språk/stil:** norsk bokmål, mørkt tema, mobil først (360–430 px), men skal se ok ut på desktop.
  Store trykkflater (≥ 44 px), tall i tabulær font, høy kontrast.

## Kjernefunksjoner (v1)

### 1. Logge økt (viktigst)
- Start tom økt eller fra mal. Kun én aktiv økt per person; den overlever reload og bytte av enhet.
- Legg til øvelse via søk i øvelsesbibliotek (~60 vanlige øvelser på norsk/engelsk, gruppert etter muskelgruppe)
  + egne øvelser.
- Per sett: kg, reps, valgfri RPE, oppvarming-flagg, «ferdig»-hake.
- Nye sett forhåndsutfylles med forrige sett i økta, ellers med det du gjorde sist på øvelsen («Sist: 3×8 @ 80 kg»).
- +/- knapper for kg (2,5) og reps (1), i tillegg til tastatur (numerisk).
- Hviletimer starter automatisk når sett hakes av (standard 90 s, justerbar), synlig flytende, vibrerer ved slutt.
- Øktvarighet, totalt volum og antall sett vises live.
- Avslutt økt → oppsummering: varighet, volum, nye PR-er, sammenlikning med forrige gang.
- Slett/rediger sett og øvelser; endre rekkefølge.

### 2. PR-er og progresjon
- Estimert 1RM (Epley) per sett. PR-typer: tyngste vekt, beste e1RM, flest reps på en vekt, største volum i én økt.
- Ny PR markeres med en gang settet hakes av (🏆 + liten feiring).
- Øvelsesside: graf over e1RM og toppvekt over tid, historikk-liste, alle PR-er.
- Profilside: totalvolum per uke (graf), antall økter, streak (uker på rad med ≥ 1 økt), favorittøvelser.

### 3. Sammenligning og sosialt
- Feed: siste økter fra alle tre med sammendrag, PR-er og reaksjoner (💪🔥😤👏).
- «Trener nå»-indikator når en kompis har aktiv økt (realtime).
- Leaderboard: velg øvelse → beste e1RM per person; i tillegg ukens volum, antall økter denne måneden, streak.
- Relativ styrke (e1RM / kroppsvekt) når kroppsvekt er registrert.

### 4. Treningsprogram / maler
- Lag maler (navn + øvelser + planlagte sett×reps). Lagre en fullført økt som mal.
- Maler er delt mellom alle tre; kan kopieres.
- Start økt fra mal med ett trykk; malen fyller inn siste brukte vekter.

### 5. Diverse
- Kroppsvekt-logg med graf.
- Eksport av egne data som JSON/CSV.
- Fungerer offline-ish: skriv lokalt først, synk når nett er tilbake (minimum: ikke miste data ved kort nettbrudd).
- Installerbar som PWA (manifest + ikon).

## Kvalitetskrav
- Ingen konsollfeil. Ingen layout som brekker på 360 px bredde.
- Lasting < 2 s på mobil; all data for gruppa lastes ved oppstart (lite datavolum).
- Tomtilstander overalt med en tydelig neste handling.
- Bekreftelse kun ved destruktive handlinger, og da i appens egen dialog (aldri `alert/confirm`).

## Iterasjonsprotokoll (forbedringsløkka)
Når v1 er live, gjenta i ~45 min:
1. **Audit:** kjør Playwright-røyktest i mobilviewport, gå gjennom hele flyten som hver av de tre brukerne
   (logge en økt, se feed, leaderboard, maler, profil). Ta skjermbilder og se på dem.
2. **Lag en backlog:** bugs > friksjon i logging > manglende funksjon som en ivrig løfter ville forventet > polish.
3. **Velg 2–4 ting**, implementer, kjør `npm run build` + røyktest, se på skjermbilder.
4. **Deploy** (git push → Vercel), og logg runden i `CHANGELOG.md`.
5. Gjenta. Aldri bryt eksisterende data; nye felt i `data` skal ha fornuftige standardverdier.

## Løping (fase 1 – bygget 2026-10-04)
- Løping er en egen økttype i samme app (ikke egen modus): `workouts`-dokument med `kind: 'run'` og `run { distanceKm?, distanceEst?, durationSec?, durationEst?, routeId?, runType?, elevationM?, avgHr? }`. Mangler `kind` = styrke.
- En løpetur teller som økt i ukesmål, streak, kalender og «økter denne måneden». Volum/1RM hopper over løpeturer.
- Logging: distanse og tid er valgfrie hver for seg (minst én), med «ca.»-bryter for anslag. Tempo bare når begge finnes. Appen oppfordrer til å fylle inn begge, men tvinger ikke.
  - Bare tid: teller i ukesmål og minutter. Bare distanse/ca.: teller i km-totaler og km-mål (merket ca.). Rekorder og tempo-topplister krever målte verdier for begge.
- Ruter (`collection = 'routes'`): navn + distanse, delt mellom alle. Velger man en rute er distansen målt; egen rekordliste per rute. Turer lagrer distansen selv, så endring av ruta påvirker ikke gamle turer.
- Stoppeklokke: lagrer bare starttid/pauser, så den virker med låst skjerm. Ingen GPS.
- Ukesmål (`profile.goal`): Samlet (N økter), Fordelt (X styrke + Y løping) eller Med minimum (N økter, minst M løping), pluss valgfritt km-mål. Gammelt `weeklyGoal` brukes som Samlet.
- Topplister: bryter Styrke | Løping. Løping: km uke/måned (inkl. ca.), rute-rekorder, lengste tur, beste 5 km/10 km/halvmaraton (fra målte turer på D–1,15·D km, regnet om etter snittempo), beste snittempo (3+ km).
- Fase 2 (ikke bygget): Strava-import, intervaller drag for drag, tredemølle-flagg.

## Supplementer (steg 1 av mat og supplementer – bygget 2026-10-05)
- Bare egne supplementer vises (egen profil + «I dag»-kort i feeden). Ikke synlig for de andre i appen.
- `collection = 'supplements'`: `{ userId, name, amount?, unit?, doses: [{ hour }], stock?: { total, refillAt }, pauses?: [{ from, to? }], createdAt }`.
- `collection = 'supplement_logs'`: id `sl:<supId>:<yyyy-mm-dd>:<doseIndex>` – avkrysning per dose per dag (fjernes med myk sletting).
- Streak per supplement = dager på rad med alle doser tatt; i dag bryter ikke før den er over; pausedager hoppes over. Kalender 6 uker, trykk på dag (siste 30 dager) for å krysse av/fjerne, «Tok den i går».
- Lager: total i samme enhet som dosen, telles fra `refillAt`; varsel én gang når ≤ 7 dager igjen; «Ny boks» nullstiller.
- Påminnelser (hele timer): hvis en dose ikke er krysset av når timen er nådd. Slås sammen med treningspåminnelsen når begge går samme time. «Tatt ✓»-knapp i varselet (Android/PC) via `/api/supp-take`; iPhone åpner `#/supplementer`. Kan slås av under Varsler.
- Mat: senere steg (ikke bygget).

## Innlogging og treningsgrupper (bygget 2026-10-06)
- **Innlogging** med 6-sifret kode på e-post (Supabase Auth, ingen passord). Økta huskes på enheten (oppfriskes automatisk), og appen starter fra cache uten nett. Alle kan registrere seg.
- **Kontoer:** `account:<auth uid>` → app-bruker-id. Felix kobles automatisk via e-post (bare hash i koden). David og Erik kobles med engangslenke som Felix lager under Profil → «Koble David og Erik» (`#/koble/<bruker>/<kode>`). Nye brukere får id `u…`, navn, farge og symbol.
- **Tilgang (RLS i `supabase/auth.sql`):** du ser egne data + data fra folk som deler gruppe med deg. Kroppsvekt, supplementer, push-abonnementer og kontoen er alltid private. Private økter ser bare eieren. Grupper/medlemskap endres bare via RPC-er. `lockdown.sql` fjerner anon-tilgangen helt.
- **Grupper:** alle økter teller automatisk i alle gruppene dine. Én admin (kan gi admin videre, fjerne medlemmer, slå av/fornye invitasjonslenke, gjøre gruppa offentlig). Går admin ut, går rollen til eldste medlem; siste medlem legger ned gruppa. Invitasjon med lenke `#/bli-med/<kode>` eller QR-kode. Startgruppe: «Jernlogg-gjengen» (felix, david, erik).
- **Felles mål** (km / økter / kg i en periode) og **ukas utfordring** (flest reps eller tyngste løft i en øvelse, flest økter, km eller volum; kan gjentas hver uke) – satt av admin.
- **Feed og topplister** kan vises for alle grupper eller én gruppe (`useScope`). Lange lister viser topp 10 + deg.
- **Offentlige grupper** havner på gruppe-topplisten (`#/grupper/topp`): kg løftet (vekt × reps i fullførte arbeidssett) og km løpt, denne uka / måneden / i år, totalt eller per medlem. Regnes på serveren (`jl_group_board`).
- **Privat økt:** teller i egen statistikk og eget ukesmål, aldri i grupper, topplister, utfordringer, mål eller varsler.
- **Personvern:** `#/personvern`, last ned egne data, «Slett kontoen min» (sletter alt brukeren eier, også innloggingen).
- **Tilbakemeldinger:** fra felix/david/erik behandles direkte. Fra andre (og klager fra andre) må Felix godkjenne først (`feedback_review`), og Claude bruker den godkjente teksten.
- **Ytelse:** databasen sender bare det du har tilgang til; etter første lasting hentes bare endringer (`synced_at`), full lasting maks hver 12. time eller når medlemskap endres; cache i IndexedDB; indeks per samling i minnet.
