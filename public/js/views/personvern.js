// Personvernerklæring. Kan leses uten å logge inn (lenke fra innloggingssiden og bunnteksten).
// Oppdater teksten og datoen når siden begynner å lagre noe nytt om folk.

import { html, raw, esc } from "../util.js";

const OPPDATERT = "12. oktober 2026";
const KONTAKT = "Mona Melvold (kasserer)";

export function personvern(main, S) {
  const klubb = S.innst.klubbnavn;
  main.innerHTML = html`
    <article class="kort personvern">
      <div class="sidetopp"><h1>Personvernerklæring</h1><a class="lenkeknapp" href="#/">Tilbake</a></div>
      <p class="hint">Sist oppdatert ${OPPDATERT}</p>
      ${raw(`
      <p>Her står det hvilke opplysninger om deg nettsiden til ${esc(klubb)} lagrer, hvorfor, hvem som ser dem, og hvilke rettigheter du har.</p>

      <h2>Hvem som er ansvarlig</h2>
      <p><strong>${esc(klubb)}</strong> er behandlingsansvarlig for opplysningene. Kontaktperson for personvern er ${KONTAKT}.
      Spørsmål og ønsker om innsyn, retting eller sletting sendes til henne eller til styret.</p>

      <h2>Hva vi lagrer</h2>
      <ul>
        <li><strong>Innlogging:</strong> e-postadresse og navn. Passordet ditt lagres kryptert hos Google og kan ikke leses av klubben.</li>
        <li><strong>Medlemslisten:</strong> navn, e-post, telefon og om du har betalt kontingent.</li>
        <li><strong>Søknader om refusjon:</strong> hva du har lagt ut for, beløp, dato, kontonummeret ditt og bilder av kvitteringene.</li>
        <li><strong>Regnskapet:</strong> poster som kan nevne deg, for eksempel kontingent eller refusjon til deg.</li>
        <li><strong>Møter:</strong> styreverv, og når du har signert et referat (navn, tidspunkt og en kontrollsum av teksten).</li>
      </ul>

      <h2>Hvorfor vi lagrer det</h2>
      <ul>
        <li>For å holde oversikt over medlemmer og kontingent.</li>
        <li>For å betale tilbake penger du har lagt ut for klubben.</li>
        <li>For å føre regnskap, som klubben er pålagt.</li>
        <li>For å kalle inn til møter og godkjenne referater.</li>
      </ul>
      <p>Grunnlaget er medlemskapet ditt i klubben, klubbens plikt til å føre regnskap, og klubbens berettigede interesse i å drive foreningen.</p>

      <h2>Hvem som ser opplysningene</h2>
      <ul>
        <li><strong>Kassereren</strong> ser alt.</li>
        <li><strong>Styret</strong> ser oversikten over regnskapet, søknader om refusjon og medlemslisten.</li>
        <li><strong>Revisor</strong> ser regnskapet med kvitteringer og medlemslisten når klubben gir tilgang, men ikke søknadene eller kontonummeret ditt.
          Revisor kan ikke endre noe, og tilgangen gis bare for revisjonen.</li>
        <li><strong>Vanlige medlemmer</strong> ser bare sine egne søknader, møteinnkallinger, referater og hvem som sitter i styret.</li>
        <li><strong>Administratoren</strong> (Tillerflaten Digital) ser regnskapet bare når klubben ber om hjelp, og da i høyst 24 timer om gangen.</li>
      </ul>
      <p>Ved innkalling til møter sendes e-postadressen din til den som sender innkallingen, og den ligger i blindkopi så andre mottakere ikke ser den.</p>

      <h2>Hvem som behandler opplysningene for oss</h2>
      <ul>
        <li><strong>Tillerflaten Digital</strong> har laget og drifter nettsiden.</li>
        <li><strong>Google (Firebase)</strong> står for innlogging og databasen. Dataene lagres i Europa.</li>
        <li><strong>GitHub</strong> leverer selve nettsiden (ingen opplysninger om deg lagres der).</li>
      </ul>

      <h2>Hvor lenge vi lagrer</h2>
      <ul>
        <li>Regnskap og bilag, også kvitteringer fra søknader som er betalt ut, lagres i 5 år etter regnskapsåret, slik bokføringsloven krever.</li>
        <li>Søknader som er avslått eller trukket, kan slettes når de er ferdig behandlet.</li>
        <li>Når du melder deg ut, slettes innloggingen din, og opplysningene i medlemslisten slettes eller anonymiseres. Det som må beholdes i regnskapet, beholdes til fristen er ute.</li>
        <li>Godkjente møtereferater og signaturer er en del av klubbens historikk og beholdes.</li>
        <li>Kassereren tar en sikkerhetskopi av alt minst hvert kvartal, så ingenting går tapt. Kopiene oppbevares trygt av klubben,
          og eldre kopier slettes når nyere finnes.</li>
      </ul>

      <h2>Rettighetene dine</h2>
      <p>Du har rett til å få vite hva som er lagret om deg, få rettet feil, få slettet opplysninger som ikke må beholdes, og be om at behandlingen begrenses.
      Kontakt ${KONTAKT} eller styret. Mener du at vi ikke følger reglene, kan du klage til
      <a href="https://www.datatilsynet.no" target="_blank" rel="noopener">Datatilsynet</a>.</p>

      <h2>Informasjonskapsler</h2>
      <p>Nettsiden lagrer bare det som trengs for at du skal være innlogget og for at siden skal virke uten nett. Vi bruker ikke sporing, statistikk eller reklame.</p>
      `)}
    </article>`;
}
personvern.tittel = "Personvern";

