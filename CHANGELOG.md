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
