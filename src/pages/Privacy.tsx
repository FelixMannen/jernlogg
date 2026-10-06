import { TopBar, back, useMe } from '../components/ui'
import { downloadMyData } from './Profile'

export function PrivacyPage() {
  const { me } = useMe()
  return (
    <>
      <TopBar title="Personvern" onBack={() => back('profil')} />
      <div className="page stack prose">
        <section className="card stack">
          <h2>Kort fortalt</h2>
          <ul className="small">
            <li>Vi lagrer det du logger: økter, sett, løpeturer, maler, kroppsvekt, supplementer, kommentarer, reaksjoner og tilbakemeldinger – pluss e-postadressen du logger inn med.</li>
            <li>
              <b>Øktene dine</b> ser bare du og folk som er med i en gruppe sammen med deg. Merker du en økt som <b>privat</b>, ser bare du den.
            </li>
            <li>
              <b>Kroppsvekt og supplementer</b> ser bare du – aldri andre, heller ikke gruppene dine.
            </li>
            <li>
              <b>Offentlige grupper</b> vises på gruppe-topplisten med navn, antall medlemmer og samlet kg løftet og km løpt. Enkeltøkter og navn på medlemmer vises ikke der.
            </li>
            <li>E-postadressen din brukes bare til innlogging og vises ikke for andre.</li>
            <li>Tilbakemeldinger du sender, er synlige for alle innloggede (så alle ser hva som er ønsket og fikset).</li>
            <li>Ingen reklame, ingen sporing, ingen salg av data.</li>
          </ul>
        </section>
        <section className="card stack">
          <h2>Hvor dataene ligger</h2>
          <p className="small">
            Dataene lagres i en database hos Supabase, og appen leveres fra Vercel. Push-varsler går via nettleserens varseltjeneste (Apple, Google eller Mozilla) og inneholder bare
            teksten i varselet. Appen lagrer også en kopi på telefonen din, så den virker uten nett.
          </p>
        </section>
        <section className="card stack">
          <h2>Dine rettigheter</h2>
          <p className="small">Du kan når som helst laste ned alt du har lagret, endre det, eller slette kontoen din med alle data.</p>
          <button className="btn block" onClick={() => downloadMyData(me)}>
            Last ned alle mine data (JSON)
          </button>
          <p className="tiny muted">Slett kontoen: Profil → ⋯ → «Slett kontoen min». Spørsmål? Send en tilbakemelding fra profilsiden.</p>
        </section>
      </div>
    </>
  )
}
