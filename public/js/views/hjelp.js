// Hjelp: brukermanualen. Viser delen for hver rolle den innloggede har (medlem, styret, kasserer, administrator).
// Teksten ligger her i koden, så den følger med når nettsiden endres. Husk å oppdatere den når noe nytt kommer til.

import { html, raw } from "../util.js";
import { erKasserer, erStyret, erAdmin } from "../tilgang.js";

// Hver del: tittel, hvem den gjelder for, og emner (tittel, tekst i enkel HTML som vi skriver selv, og eventuelle skjermbilder).
// Skjermbildene ligger i public/hjelp/ og er tatt med oppdiktede testdata.
const DELER = [
  {
    id: "medlem", tittel: "For alle medlemmer", gjelder: () => true,
    emner: [
      ["Første gang: lag konto og få tilgang", `
        <ol>
          <li>Trykk «Ny bruker? Opprett konto» på innloggingssiden. Bruk e-postadressen du er registrert med i klubben.</li>
          <li>Du får en e-post med en lenke. Trykk på den for å bekrefte adressen (sjekk søppelpost hvis den ikke kommer).</li>
          <li>Logg inn, skriv fullt navn og trykk «Be om tilgang».</li>
          <li>Kassereren får beskjed og gir deg tilgang. Siden åpner seg av seg selv når det er gjort.</li>
        </ol>`, ["innlogging"]],
      ["Glemt passord", `<p>Trykk «Glemt passord?» på innloggingssiden og skriv e-postadressen din. Du får en lenke for å lage nytt passord.
        Er du logget inn, kan du også bytte passord under <a href="#/minside">Min side</a>.</p>`],
      ["Legg siden på hjemskjermen", `
        <p>Da åpnes den som en app, uten adresselinje.</p>
        <ul>
          <li><strong>iPhone:</strong> Åpne siden i Safari, trykk Del-knappen (firkant med pil opp) og velg «Legg til på Hjem-skjerm».</li>
          <li><strong>Android:</strong> Åpne siden i Chrome, trykk de tre prikkene øverst til høyre og velg «Installer app» eller «Legg til på startsiden».</li>
        </ul>`],
      ["Få igjen penger du har lagt ut", `
        <ol>
          <li>Gå til «Ny søknad» (eller «Mine søknader» og «+ Ny søknad»).</li>
          <li>Skriv hva du har lagt ut for, beløp, dato og kontonummeret ditt. Ta bilde av eller last opp kvitteringen. Du kan legge ved flere.</li>
          <li>Trykk «Send søknad». Kassereren godkjenner den og betaler ut.</li>
        </ol>
        <p>Under «Mine søknader» ser du om søknaden er sendt, godkjent, avslått eller utbetalt. Så lenge den ikke er behandlet, kan du trekke den.
        Lagrer du kontonummeret under <a href="#/minside">Min side</a>, fylles det inn av seg selv neste gang.</p>`, ["ny-soknad", "mine-soknader"]],
      ["Møter og referater", `
        <p>Under <a href="#/moter">Møter</a> ligger innkallinger og referater. Medlemsmøter og årsmøter er åpne for alle medlemmer.
        Under «Styret» ser du hvem som har hvilke verv.</p>`],
      ["Signere et referat", `
        <p>Er du bedt om å signere, ser du et varsel øverst på «Møter», og et tall i menyen. Åpne møtet, les referatet,
        huk av for at du har lest det og trykk «Signer». Når alle har signert, blir referatet godkjent og kan ikke endres lenger.</p>
        <p>Signaturen er en bekreftelse fra deg som innlogget bruker, med tidspunkt og en kontrollsum av teksten. Den viser at teksten
        ikke er endret etter at den ble signert. Det er ikke BankID.</p>`, ["signer"]],
      ["Min side og kontingent", `<p>På <a href="#/minside">Min side</a> ser du navnet ditt, kontonummeret for refusjoner og om kontingenten
        for i år er registrert som betalt. Der står også hvordan du betaler kontingenten. Har du nettopp betalt, kan det ta litt tid før kassereren registrerer det.</p>`, ["minside"]],
    ],
  },
  {
    id: "styret", tittel: "For styret", gjelder: (S) => erStyret(S),
    emner: [
      ["Hva styret kan se", `<p>Alle som har et styreverv, ser <strong>Oversikt</strong> med nøkkeltallene og alle <strong>Søknader</strong> som kommer inn.
        Styret kan lese, men ikke endre regnskapet eller behandle søknader. Det gjør kassereren.</p>`, ["oversikt"]],
      ["Legg ut en innkalling", `
        <ol>
          <li>Gå til «Møter» og trykk «+ Ny innkalling».</li>
          <li>Velg styremøte, medlemsmøte eller årsmøte. Fyll inn emne, dato, klokkeslett, sted og saksliste.</li>
          <li>Lagre. Innkallingen er synlig for alle med innlogging med en gang. Styremøter er også synlige, men bare styret kan endre dem.</li>
        </ol>`, ["ny-innkalling"]],
      ["Send innkallingen som PDF", `
        <p>Åpne møtet. Nederst i innkallingen finner du knappene:</p>
        <ul>
          <li><strong>Last ned PDF</strong> lager innkallingen som PDF med logo, emne, tid, sted og saksliste.</li>
          <li><strong>Send på e-post</strong> laster ned PDF-en og åpner e-postprogrammet med mottakerne som blindkopi (Bcc).
            Dra PDF-en inn i e-posten før du sender. En nettside får ikke lov til å legge ved filer av seg selv.</li>
          <li><strong>Del PDF</strong> (på telefon) sender fila rett til Mail eller Outlook og kopierer adressene, så du kan lime dem inn i Bcc.</li>
          <li><strong>Kopier adressene</strong> hvis du heller vil skrive e-posten selv.</li>
        </ul>
        <p>Ved styremøter går innkallingen til styret. Ved medlemsmøter og årsmøter går den til alle aktive medlemmer som har e-post i medlemslisten.</p>`, ["send-pdf"]],
      ["Skriv referat og send til signering", `
        <ol>
          <li>Åpne møtet og trykk «Skriv referat». Trykk «Lagre utkast» underveis. Bare styret ser utkastet.</li>
          <li>Velg hvem som skal signere, og send til signering. Da kan alle medlemmer lese referatet, og de som skal signere, får varsel.</li>
          <li>Må noe endres, trykk «Trekk tilbake for å endre». Signaturer som er gitt, slettes, og alle må signere på nytt.</li>
        </ol>`, ["referat"]],
      ["Styreverv", `<p>Under «Møter» og «Styret» ser du hvem som har hvilke verv. Kassereren og administratoren kan endre hvem som har dem.</p>`],
      ["Trenger dere hjelp?", `<p>Under Min side kan du be om support. Da får administratoren full tilgang i 24 timer, og tilgangen stenges av seg selv.</p>`],
    ],
  },
  {
    id: "kasserer", tittel: "For kassereren", gjelder: (S) => erKasserer(S),
    emner: [
      ["Kom i gang", `
        <ol>
          <li>Under <a href="#/innstillinger">Innstillinger</a>: fyll inn klubbens navn, organisasjonsnummer og startdato.</li>
          <li>Legg inn kontoene (bank, Vipps, kontantkasse) med saldoen den dagen dere begynte å bruke nettsiden.</li>
          <li>Se over kategoriene for inntekter og utgifter. Du kan legge til egne.</li>
          <li>Fyll inn kontingent og kontonummer for kontingent. Det vises for medlemmene på Min side.</li>
        </ol>`, ["innstillinger"]],
      ["Før inntekter og utgifter", `<p>Trykk «+ Ny post» på Oversikt eller Poster. Velg inntekt, utgift eller overføring mellom kontoer, og fyll inn dato,
        beløp, kategori og beskrivelse. Hver post får et bilagsnummer. Velg år øverst for å se et annet regnskapsår.
        «Excel» laster ned postene som en fil du kan åpne i Excel.</p>`, ["ny-post"]],
      ["Behandle søknader om refusjon", `
        <ol>
          <li>Nye søknader vises med et tall ved «Søknader» i menyen. Åpne søknaden og se kvitteringene.</li>
          <li>Trykk «Godkjenn» eller «Avslå». Avslår du, må du skrive en kort begrunnelse til søkeren.</li>
          <li>Når du har overført pengene i nettbanken, fyll inn dato, beløp og kategori under «Betalt ut? Før det i regnskapet» og trykk «Marker som utbetalt».
            Da blir det en utgift i regnskapet med kvitteringene vedlagt.</li>
        </ol>`, ["behandle-soknad"]],
      ["Medlemmer og kontingent", `<p>Under <a href="#/medlemmer">Medlemmer</a> legger du inn medlemmene med navn, e-post og hund.
        Trykk på et medlem for å registrere betalt kontingent. Da føres den også i regnskapet. Har dere fått ett samlet beløp (f.eks. fra Vipps),
        kan du fjerne haken og føre totalen som én post selv. «Excel» laster ned medlemslisten.</p>`, ["medlemmer"]],
      ["Gi nye brukere tilgang", `<p>Når noen ber om tilgang, vises de øverst under Medlemmer. Trykk «Gi tilgang» eller «Avvis».
        Du kan også åpne et medlem med e-post og huke av for innlogging. Da kommer personen inn når hen lager konto med samme e-post.</p>`],
      ["Styreverv", `<p>Under «Møter» og «Styret» trykker du «Endre verv» for å velge hvem som har hvilket verv. Den som har et verv,
        ser oversikten og søknadene og kan legge ut møter. Vervet «Kasserer» er bare en tittel. Tilgang til regnskapet gis under Innstillinger.</p>`, ["verv"]],
      ["Årsrapport", `<p><a href="#/rapport">Årsrapport</a> samler resultatregnskap, saldo på kontoene, medlemmer og bilagsliste for året.
        Trykk «Skriv ut / lagre PDF» og velg «Lagre som PDF» for å sende den til revisor eller årsmøtet.</p>`],
      ["Ny kasserer", `<p>Legg den nye kassereren inn som medlem med e-post og gi vedkommende tilgang. Gjør personen til kasserer under
        Innstillinger, og fjern deg selv etterpå.</p>`],
      ["Trenger du hjelp?", `<p>Under Innstillinger kan du be om support. Da får administratoren full tilgang i 24 timer, og tilgangen stenges av seg selv.</p>`],
    ],
  },
  {
    id: "admin", tittel: "For administratoren", gjelder: (S) => erAdmin(S),
    emner: [
      ["Hva administratoren kan", `<p>Administratoren bestemmer hvilke styreverv som finnes (under «Styret» og «Endre verv»), og kan gi verv.
        Regnskapet ser du bare når kassereren har bedt om support. Da har du full tilgang i 24 timer.</p>`],
      ["Tilgangsreglene i Firebase", `<p>Hvem som kan lese og endre hva, styres av fila <code>firestore.rules</code>. Når den endres,
        må den publiseres: lim den inn under Firestore og «Rules» i Firebase-konsollet og trykk «Publish», eller la GitHub-jobben gjøre det
        (se <code>docs/regler-automatisk.md</code>).</p>`],
    ],
  },
];

export function hjelp(main, S) {
  const mine = DELER.filter((d) => d.gjelder(S));
  main.innerHTML = html`
    <div class="sidetopp"><h1>Hjelp</h1></div>
    <p class="hint">Trykk på et emne for å lese mer. Du ser delene som gjelder deg${mine.length > 1 ? `: ${mine.map((d) => d.tittel.replace(/^For /, "")).join(", ")}` : ""}.</p>
    ${mine.map((d) => raw(html`
      <section class="kort hjelp" id="hjelp-${d.id}">
        <h2>${d.tittel}</h2>
        ${d.emner.map(([tittel, tekst, bilder = []]) => raw(html`
          <details>
            <summary>${tittel}</summary>
            <div class="hjelp-tekst">${raw(tekst)}
              ${bilder.length ? raw(html`<div class="hjelp-bilder">${bilder.map((b) => raw(html`
                <img src="hjelp/${b}.jpg" alt="Skjermbilde: ${tittel}" loading="lazy">`))}</div>`) : ""}
            </div>
          </details>`))}
      </section>`))}
    <p class="hint">Finner du ikke svaret? Spør kassereren eller noen i styret.</p>`;
}
hjelp.live = false;
hjelp.tittel = "Hjelp";
