# Changelog

## v1 – første versjon
- Logging av økter: øvelsesbibliotek (~60 øvelser), egne øvelser, kg/reps per sett, oppvarmingssett, «Forrige»-kolonne, +/- steppere, hviletimer
- Live PR-deteksjon (tyngste vekt, e1RM, reps på vekt, volum) med feiring
- Feed med reaksjoner og kommentarer, «trener nå»-indikator
- Topplister: beste 1RM per øvelse (også relativt til kroppsvekt), Big 3-total, ukens volum, økter denne måneden, streak
- Maler: lag/rediger/slett, lagre økt som mal, ferdige forslag (Push/Pull/Bein)
- Profil: statistikk, volum per uke, rekorder, kroppsvekt-graf, eksport JSON/CSV, hviletid-innstilling
- Øvelsesside: e1RM/toppvekt/volum over tid, sammenlign alle tre, prosenttabell
- Offline-kø: endringer lagres lokalt og synkes når nettet er tilbake

## Runde 1
- Skjermen holdes våken under økta (Wake Lock)
- Pip-lyd når hvilen er over (i tillegg til vibrasjon – iPhone vibrerer ikke fra nettsider)
- Skivekalkulator: når du redigerer kg på en stangøvelse vises skivene per side i riktige farger
- Rediger fullførte økter (fikse feiltastinger i etterkant)
- Hviletimeren dekker ikke lenger nederste innhold

## Runde 2
- Ukesmål: alle tre har et mål (standard 3 økter/uke, endres i innstillinger), vist øverst i feeden
- Progresjonsforslag i loggeren: «Klarte 3×8 @ 80 sist – prøv 82,5 kg»
- Profil: kalender over treningsdager (18 uker) og sett per muskelgruppe siste 4 uker

## Runde 3
- «Generer oppvarming» i øvelsesmenyen: stang × 10, 40 % × 5, 60 % × 3, 80 % × 2 av arbeidsvekta
- Angre når du sletter et sett
- Etter økta: velg hvordan den føltes (😵 → 🦍) og skriv et notat – vises i feeden
- Varsler i appen når en kompis starter eller fullfører en økt (med antall PR-er)

## Runde 4
- Fungerer uten nett: appen lastes fra cache (service worker), og sett som logges offline synkes når dekningen er tilbake
- I loggeren vises rekordene til alle tre på hver øvelse (👑 til den som leder)
- Topplister: «Hvem er sterkest på hva» – tabell over alle øvelser minst to har logget, med antall kroner per person

## Runde 5
- Raskere: tunge beregninger (historikk, PR-er) mellomlagres til data endres – appen holder seg kjapp når loggen vokser
- Milepæler på profilen (100 kg benk, 140 kg knebøy, 50 økter, 8 uker på rad, 100 t totalt …) med «nærmest neste»-fremdrift
- «Siste PR-er» på profilen med hvor mye du forbedret deg

## Runde 6
- Neste sett er markert i loggeren, og når siste sett på en øvelse hukes av, scroller appen til neste øvelse
- Varsel når noen reagerer på eller kommenterer økta di
- Verifisert live: sanntidssynk mellom to enheter fungerer (endringer dukker opp på ~1–3 s uten refresh), og offline-cache er aktiv

## Runde 7
- Utvidet automatisk test: mal → start økt → generer oppvarming → fullfør → velg følelse → rediger → lagre
- Oppvarmingssett heter nå V1, V2 … (O1 så ut som 01)
- Engangstips i loggeren som forklarer oppvarming, «Forrige» og hviletimer

## Runde 8
- Kroppsvektøvelser (pull-ups, dips, chins …) rangeres på flest reps i stedet for 1RM – på topplister, «hvem er sterkest» og rekordlinja i loggeren
- Øvelsessiden for kroppsvektøvelser viser flest reps, reps totalt og ekstra vekt
- Grafer med heltall (reps) får heltallsakse

## Runde 9
- «Gjør samme økt som David»: start en kompis' økt med samme øvelser og antall sett (vektene hentes fra din egen historikk)
- Verktøy-side: skivekalkulator (20/15/10 kg stang) og 1RM-kalkulator med prosenttabell – lenket fra profilen

## Runde 10
- «Logg en tidligere økt eller gamle rekorder»: velg dato og registrer, så topplister og PR-er stemmer fra dag én

## Runde 11 – tilbakemeldinger
- Ny seksjon på profilsiden: «Tilbakemelding på appen». Ønsker lagres i databasen, vises som «Venter» for alle tre, og blir markert «✓ Fikset» med beskrivelse når de er gjort
- `CLAUDE.md` i repoet: hver arbeidsøkt starter med å hente åpne tilbakemeldinger (`node scripts/feedback.mjs list`), fikse dem og krysse dem av (`... done <id> "hva som ble endret"`)

## Runde 12
- Egen hviletid per øvelse (f.eks. 3 min på knebøy, 60 s på sidehev) – i øvelsesmenyen i loggeren
- «Ny versjon av appen er klar · Oppdater»-knapp når en oppdatering er publisert (sjekker hvert 5. min og når appen åpnes igjen)

## Runde 13
- Supersett: koble en øvelse med neste i øvelsesmenyen. Kortene henger sammen, hviletimeren starter først etter siste øvelse i supersettet, og appen hopper til neste øvelse etter hvert sett

## Runde 14
- «Last ned full backup av alle data» under Profil → ⋯ (alle økter, maler, reaksjoner osv. for alle tre, som JSON)

## Runde 15 – se tilbakemeldinger + klager
- Ny side «Tilbakemeldinger» (Profil → «Se alle tilbakemeldinger»): alle tilbakemeldinger fra alle tre med status Venter / ✓ Fikset / Klage – gjøres på nytt, og filter
- Fiksede tilbakemeldinger har knappen «Tilbakemelding utført dårlig»: skriv hva som er galt, så logges klagen synlig for alle, og tilbakemeldingen settes tilbake til venter
- Hver tilbakemelding har en tidslinje med alle forsøk og klager
- `scripts/feedback.mjs list` viser klager og tidligere forsøk; `CLAUDE.md` sier at klager skal leses og løses skikkelig

## Runde 16 – tilbakemelding fra David: importer økt fra tekst
- Ny side `#/import`: åpner en lenke `…/#/import?d=<tekst>` som en ferdig utfylt økt, eller lar deg lime inn tekst / laste opp .md/.txt
- Jernlogg-format v1 (bruker, dato, varighet, notat, «Øvelse: SxRxKG, RxKG …»), tåler +, %-koding, æøå, `;` eller linjeskift, x/X/× og ødelagt koding
- Alt kan redigeres før lagring; ingenting lagres før du trykker «Lagre økt». Etter lagring går appen til feeden og fjerner `d=` fra adressen
- Linjer som ikke kan tolkes vises med linjenummer; ukjente øvelser må avklares («Velg eksisterende» / «Opprett ny»); ukjent bruker gir advarsel
- Duplikatvarsel når samme bruker allerede har en økt med samme dato og øvelser
- «Kopier instruks til Claude» på import-siden, så Claude lager riktige lenker
- Robusthet: endringer skrives til enheten med en gang hvis fanen lukkes eller appen legges i bakgrunnen
- Tester: `scripts/test-import.ts` (parser, inkl. Davids 5 testtilfeller) og `scripts/import-e2e.mjs` (hele flyten i nettleser)

## Runde 17 – ordentlig PWA + push-varsler
- Installerbar app: nytt iOS-ikon (180 px), maskable-ikon for Android, `id`/`scope`, snarveier (Start økt, Topplister), guide for «Legg til på Hjem-skjerm» på iPhone og installer-knapp på Android/PC
- Ny service worker: sider og app-kode hentes alltid fra nett først (nye deployer slår igjennom med en gang), cache bare som reserve offline; håndterer push og åpner riktig side når du trykker på et varsel
- Varsler (Profil → Varsler): slå på med ett trykk, «Send testvarsel», slå av per enhet
  - «Du burde trene i dag 💪» etter X dager uten økt, på klokkeslettet du velger (med kontekst: ukesmål, hva kompisene har gjort)
  - «David trente akkurat 💪 – din tur!» når en kompis fullfører en økt
- Vercel-funksjoner: `/api/push-test`, `/api/notify`, `/api/cron`, `/api/health`; Supabase `pg_cron` hver time + Vercel Cron daglig som reserve
- Nye samlinger i `docs`: `push_subscriptions`, `push_log` – ingen endring av eksisterende data eller skjema

## Runde 18 – løping (fase 1) + rediger/slett
- Tilbakemelding fra David: ⋯-meny på egne økter (i feeden og på øktsiden) med «Rediger øvelser og sett», «Endre dato, tid, tittel og notat», «Lagre som mal» og «Slett»
- Løping som egen økttype: Start → Styrke / Løpetur
- Logg løpetur med distanse og/eller tid, «ca.» for anslag, tempo regnes ut, type, følelse, notat, høydemeter og puls
- Ruter (f.eks. Elverunden) med egen rekordliste – velg rute, skriv bare tiden
- Stoppeklokke med pause som tåler låst skjerm
- Løpekort i feeden, egen løpeside med rute-rekorder, PR-er (lengste tur, beste 5/10 km/halvmaraton, rute-PR)
- Topplister: bryter Styrke | Løping (km uke/måned, rute-rekorder, lengste tur, beste tider, beste snittempo)
- Profil: løpeseksjon (km per uke, rekorder, ruter, turer som mangler data)
- Ukesmål: Samlet / Fordelt / Med minimum + valgfritt km-mål, og «nådd X uker på rad»
- Import: `Løp: 8.2km 42:10 rolig` / `Løp: Elverunden 29:15`
- Varsler: «Erik løp akkurat Elverunden 🏃 – din tur!», og påminnelser tar hensyn til ukesmål per type
- Fiks: ark (sheets) åpnet fra toppmenyen havnet under bunnmenyen

## Runde 19 – tilbakemeldinger fra Erik
- Søketreff og knapper havnet bak tastaturet på mobil: alle ark (øvelsesvelger, menyer osv.) holder seg nå innenfor den synlige delen av skjermen over tastaturet, feltet du skriver i scrolles inn i synet, og bunnmenyen/hviletimeren skjules mens tastaturet er oppe. Android får i tillegg `interactive-widget=resizes-content`
- Fjernet +/- knappene som dukket opp under kg/reps når man skrev – logge-raden flytter seg ikke lenger. Oppvarming, skiver og «Slett sett» ligger nå bak et trykk på settnummeret
- Fiks: appen startet ikke alltid uten nett første gang etter installasjon (service workeren cacher nå JS/CSS med en gang og ignorerer Vary-header ved oppslag)
- Ny test: `scripts/keyboard-e2e.mjs` simulerer iPhone-tastaturet

## Runde 20 – supplementer (steg 1 av mat og supplementer)
- Profil → «💊 Supplementer»: legg inn det du tar (forslag: kreatin, proteinpulver, omega-3, vitamin D …), mengde, enhet og klokkeslett – én eller flere doser per dag
- Kryss av «tatt» på profilen, i «I dag»-kortet øverst i feeden (vises bare når noe gjenstår) eller på `#/supplementer`
- Streak og 6-ukers kalender per supplement, «Tok den i går», trykk på en dag for å rette opp, pause som ikke bryter streaken
- Lagerteller: hvor mye som er igjen og ca. antall dager; varsel når det er ≤ 7 dager igjen; «Ny boks»
- Påminnelse hvis en dose ikke er krysset av innen klokkeslettet – slås sammen med treningspåminnelsen når de kommer samtidig. «Tatt ✓»-knapp rett i varselet på Android/PC (iPhone: trykk på varselet)
- Supplementer er private – bare du ser dine
- Ny bryter under Varsler: «Supplementer»
