# Jernlogg — kravspesifikasjon

Styrketreningslogg for tre kompiser: **Felix, David og Erik**. Brukes på mobilen i gymmen,
mellom settene, ofte med svette fingre og 60 sekunder hvile. Alt skal gå raskt.

## Rammer
- **Stack:** Vite + React + TypeScript, ren CSS med design-tokens, ingen tunge UI-biblioteker.
- **Database:** Supabase (Postgres). Én generisk tabell `docs (id, collection, data jsonb, created_at, updated_at, deleted)`
  slik at nye funksjoner aldri krever migrering. Realtime-abonnement på tabellen.
- **Hosting:** Vercel, auto-deploy fra GitHub ved hver push.
- **Lokal modus:** samme app kjører mot en localStorage-adapter når Supabase ikke er konfigurert (`?local=1`),
  brukt til automatisert testing.
- **Brukere:** ingen passord. Velg navn ved første besøk (huskes på enheten). Kan bytte bruker i menyen.
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
