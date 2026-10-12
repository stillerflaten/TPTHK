// Hjelp: brukermanualen. Viser delen for hver rolle den innloggede har (medlem, styret, revisor, kasserer, administrator).
// Teksten ligger her i koden, så den følger med når nettsiden endres. Husk å oppdatere den når noe nytt kommer til.

import { html, raw } from "../util.js";
import { erKasserer, erStyret, erAdmin, erRevisor } from "../tilgang.js";

// Hver del: tittel, hvem den gjelder for, og emner (tittel, tekst i enkel HTML som vi skriver selv, og eventuelle skjermbilder).
// Skjermbildene ligger i public/hjelp/ og er tatt med oppdiktede testdata.
const DELER = [
  {
    id: "medlem", tittel: "For alle medlemmer", gjelder: (S) => S.profil?.rolle !== "revisor",
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
      ["Regelverk", `<p>Under <a href="#/regelverk">Regelverk</a> finner du klubbens vedtekter og andre regler, sortert i vedtekter og statutter,
        retningslinjer, vedtak og annet. Trykk «Åpne» for å lese dokumentet. PDF-er åpnes i en ny fane, og lenker går til nettsiden der regelen ligger.</p>`],
      ["Min side og kontingent", `<p>På <a href="#/minside">Min side</a> ser du navnet ditt, kontonummeret for refusjoner og om kontingenten
        for i år er registrert som betalt. Der står også hvordan du betaler kontingenten. Har du nettopp betalt, kan det ta litt tid før kassereren registrerer det.</p>`, ["minside"]],
      ["Personvern", `<p>I <a href="#/personvern">personvernerklæringen</a> står det hva som lagres om deg, hvem som ser det, og hvilke rettigheter du har.
        Den ligger også som lenke nederst på siden og på innloggingssiden.</p>`],
    ],
  },
  {
    id: "styret", tittel: "For styret", gjelder: (S) => erStyret(S),
    emner: [
      ["Hva styret kan se", `<p>Alle som har et styreverv, ser <strong>Oversikt</strong> med nøkkeltallene, <strong>Årsrapport</strong> med budsjett og avvik,
        og alle <strong>Søknader</strong> som kommer inn. Styret kan lese, men ikke endre regnskapet, budsjettet eller behandle søknader. Det gjør kassereren.</p>`, ["oversikt"]],
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
      ["Legg inn vedtekter og andre regler", `
        <ol>
          <li>Gå til «Regelverk» og trykk «+ Legg til dokument».</li>
          <li>Velg kategori, skriv tittel og gjerne en kort beskrivelse og dato for når det gjelder fra.</li>
          <li>Velg «PDF-fil» og last opp fila (maks 5 MB), eller «Lenke» hvis regelen ligger på en annen nettside.</li>
          <li>Trykk «Legg til». Alle medlemmer kan lese dokumentet med en gang.</li>
        </ol>
        <p>Er vedtektene endret, trykker du «Endre» og «Bytt fil». Den gamle fila slettes når du lagrer. Alle i styret kan legge inn og endre.</p>`],
      ["Styreverv", `<p>Under «Møter» og «Styret» ser du hvem som har hvilke verv. Kassereren og administratoren kan endre hvem som har dem.</p>`],
      ["Trenger dere hjelp?", `<p>Under Min side kan du be om support. Da får administratoren full tilgang i 24 timer, og tilgangen stenges av seg selv.</p>`],
    ],
  },
  {
    id: "revisor", tittel: "For revisor", gjelder: (S) => erRevisor(S) && !erKasserer(S),
    emner: [
      ["Hva revisor kan se", `<p>Som revisor kan du lese hele regnskapet, men ikke endre noe. Du ser <strong>Oversikt</strong> med saldo og årets tall,
        alle <strong>Poster</strong> med bilagsnummer og kvitteringer, og <strong>Årsrapport</strong> med budsjett og avvik. Søknadene om refusjon og medlemmenes kontonumre ser du ikke.
        Har kassereren satt en sluttdato, stenges tilgangen av seg selv etter den dagen.</p>`, ["oversikt"]],
      ["Første gang (revisor utenfor klubben)", `<p>Kassereren legger inn e-postadressen din. Gå til nettsiden, trykk «Ny bruker? Opprett konto»
        og bruk den samme e-postadressen. Bekreft adressen med lenken du får på e-post, og logg inn. Da kommer du rett inn i regnskapet.</p>`],
      ["Gå gjennom bilagene", `<p>Velg år øverst. Under «Poster» kan du søke og filtrere på type, kategori og konto. Trykk på en post for å se bilaget,
        hvem som førte det, og kvitteringene. Trykk på «Kvittering» for å åpne bildet eller PDF-en.</p>`],
      ["Last ned til Excel eller PDF", `<p>«Excel» under Poster laster ned alle postene for året som en fil du kan åpne i Excel.
        Under «Årsrapport» kan du huke av for bilagsliste og trykke «Skriv ut / lagre PDF», eller trykke «Excel» for resultatregnskapet med budsjett og avvik.</p>`],
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
        Under beløpet ser du hvordan posten blir ført: en utgift gir minus på bankkontoen og pluss på kategorien (f.eks. «Premier og gaver»),
        en inntekt gir pluss på bankkontoen og minus på kategorien. Du fører bare beløpet én gang, så tar nettsiden seg av begge linjene.
        «Excel» laster ned postene som en fil du kan åpne i Excel.</p>
        <p>Vil du se hva klubben sitter igjen med etter et arrangement, f.eks. et seminar, lager du en kategori med samme navn under både inntekter og utgifter
        i <a href="#/innstillinger">Innstillinger</a> (f.eks. «Seminar 2026»). Før påmeldinger som inntekt og kostnader som utgift på den kategorien.
        Årsrapporten viser da inntekter, utgifter og hva dere sitter igjen med. Under Poster kan du også velge kategorien og se «Netto» nederst.</p>`, ["ny-post"]],
      ["Behandle søknader om refusjon", `
        <ol>
          <li>Nye søknader vises med et tall ved «Søknader» i menyen. Åpne søknaden og se kvitteringene.</li>
          <li>Trykk «Godkjenn» eller «Avslå». Avslår du, må du skrive en kort begrunnelse til søkeren.</li>
          <li>Når du har overført pengene i nettbanken, fyll inn dato, beløp og kategori under «Betalt ut? Før det i regnskapet» og trykk «Marker som utbetalt».
            Da blir det en utgift i regnskapet med kvitteringene vedlagt.</li>
        </ol>`, ["behandle-soknad"]],
      ["Medlemmer og kontingent", `<p>Under <a href="#/medlemmer">Medlemmer</a> legger du inn medlemmene med navn, e-post og telefon.
        Trykk på et medlem for å registrere betalt kontingent. Da føres den også i regnskapet. Har dere fått ett samlet beløp (f.eks. fra Vipps),
        kan du fjerne haken og føre totalen som én post selv. «Excel» laster ned medlemslisten.</p>`, ["medlemmer"]],
      ["Påminnelse om kontingent", `
        <ol>
          <li>Under <a href="#/medlemmer">Medlemmer</a> velger du «Ikke betalt» i listen over medlemmene. Da ser du hvem som mangler, og når de sist fikk påminnelse.</li>
          <li>Trykk «Send påminnelse». Velg frist og se over teksten. Beløp og kontonummer hentes fra Innstillinger.</li>
          <li>«Åpne e-post» åpner e-postprogrammet med alle som ikke har betalt som blindkopi (Bcc), så ingen ser hverandres adresser. Trykk send der.
            «Kopier adressene» er for deg som heller vil lime dem inn selv.</li>
        </ol>
        <p>Medlemmer uten e-post står i en egen liste, så du kan ringe eller sende SMS. Når du sender, noteres datoen på hvert medlem.
        Nettsiden sender ikke e-post selv. Det er alltid du som trykker send i e-postprogrammet.</p>`],
      ["Dine egne utlegg og Min side", `<p>Har du selv lagt ut penger for klubben, trykker du «+ Ny søknad» under <a href="#/soknader">Søknader</a>,
        akkurat som medlemmene. «Mine søknader» viser dine egne. Åpner du din egen søknad for å behandle den, får du en påminnelse om at det er lurt
        at leder eller et annet styremedlem ser over den først.</p>
        <p><a href="#/minside">Min side</a> finner du øverst på siden, ved siden av Hjelp. Der ser du kontingenten din og kan endre navn og kontonummer.
        Regelverket finner du under «Møter».</p>`],
      ["Gi nye brukere tilgang", `<p>Når noen ber om tilgang, vises de øverst under Medlemmer. Trykk «Gi tilgang» eller «Avvis».
        Du kan også åpne et medlem med e-post og huke av for innlogging. Da kommer personen inn når hen lager konto med samme e-post.</p>`],
      ["Styreverv", `<p>Under «Møter» og «Styret» trykker du «Endre verv» for å velge hvem som har hvilket verv. Den som har et verv,
        ser oversikten og søknadene og kan legge ut møter. Vervet «Kasserer» er bare en tittel. Tilgang til regnskapet gis under Innstillinger.</p>`, ["verv"]],
      ["Årsrapport", `<p><a href="#/rapport">Årsrapport</a> samler resultatregnskap, saldo på kontoene, medlemmer og bilagsliste for året.
        Er det lagt inn budsjett, vises regnskapet, budsjettet og avviket ved siden av hverandre, og budsjettet for neste år hvis det finnes.
        Trykk «Skriv ut / lagre PDF» og velg «Lagre som PDF» for å sende den til revisor eller årsmøtet. «Excel» laster ned resultatregnskapet som en fil du kan åpne i Excel.</p>`],
      ["Avstem mot banken", `
        <ol>
          <li>Når alt for året er ført, gå til <a href="#/rapport">Årsrapport</a> og trykk «Avstemming».</li>
          <li>Skriv inn saldoen per 31.12. fra årsoppgaven fra banken for hver konto (og tell opp kontantkassa). Har kontoen minus, skriv minus foran.</li>
          <li>Nettsiden sammenligner med saldoen i regnskapet og viser «Stemmer» eller avviket i kroner. Trykk «Lagre avstemming».</li>
        </ol>
        <p>Stemmer alle kontoene, stemmer regnskapet. Er det avvik, velg kontoen under <a href="#/poster">Poster</a> og sammenlign med kontoutskriften.
        Årsrapporten viser om saldoene er avstemt. Styret og revisor kan se avstemmingen, men bare kassereren kan endre den.</p>`],
      ["Budsjett", `
        <ol>
          <li>Gå til <a href="#/rapport">Årsrapport</a> og trykk «Budsjett». Velg år øverst. Skal du lage budsjett for neste år (f.eks. til årsmøtet), trykk «Lag budsjett for …».</li>
          <li>Skriv inn beløp per kategori for inntekter og utgifter. Summene og budsjettert resultat regnes ut mens du skriver.</li>
          <li>Vil du ta utgangspunkt i fjoråret, trykk «Fyll inn fra regnskapet» eller «Kopier budsjettet» og juster tallene.</li>
          <li>Trykk «Lagre budsjett».</li>
        </ol>
        <p>Årsrapporten viser da budsjett og avvik per kategori. Avvik er regnskap minus budsjett: grønt er bedre enn budsjettert (mer inntekt eller mindre utgift), rødt er dårligere.
        Oversikten viser budsjettet under inntekter, utgifter og resultat. Styret og revisor ser budsjettet, men bare kassereren kan endre det.
        Kategoriene er de samme som under Innstillinger.</p>`],
      ["Gi revisor tilgang", `<p>Gå til <a href="#/innstillinger">Innstillinger</a> og finn «Revisor». Er revisoren medlem med innlogging, velger du personen i lista.
        Er revisoren ikke medlem, skriver du navn og e-post under «Revisor utenfor klubben». Revisoren lager så konto med den e-postadressen og kommer rett inn.
        Sett gjerne en sluttdato. Revisor kan lese regnskapet med kvitteringer og årsrapporten, men ikke endre noe
        eller se søknadene. Trykk «Fjern» når revisjonen er ferdig, hvis du ikke satte sluttdato.</p>`],
      ["Sikkerhetskopi", `<p>Under <a href="#/innstillinger">Innstillinger</a> trykker du «Last ned sikkerhetskopi». Du får én ZIP-fil med regnskapet,
        medlemmene og søknadene (som filer du kan åpne i Excel), alle kvitteringer (navngitt etter bilagsnummer), og møter og referater.
        Ta en kopi minst hvert kvartal og lagre den et sted klubben har tilgang til. Det kommer et varsel på Oversikt når det er over tre måneder siden sist.</p>
        <p>Har noe forsvunnet, trykk «Gjenopprett fra sikkerhetskopi» og velg fila. Det som mangler, legges tilbake. Ingenting som finnes, blir endret eller slettet.
        Referater som var signert, kommer tilbake som utkast og må signeres på nytt.</p>`],
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
