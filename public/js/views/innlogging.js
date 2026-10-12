// Innlogging, ny konto, bekreftelse av e-post og «ingen tilgang ennå».

import { konto, sendForesporsel } from "../firebase.js";
import { html, raw } from "../util.js";
import { melding, medKnapp, feilmelding } from "../ui.js";
import { startPaaNytt } from "../app.js";

const logo = `<img class="logo-stor" src="icons/logo.svg" alt="TPTHK-logo">`;

export function ikkeKonfigurert(main) {
  main.innerHTML = html`
    <div class="sentrert kort">
      ${raw(logo)}
      <h1>Nesten klar!</h1>
      <p>Nettsiden er ikke koblet til Firebase ennå. Lim inn Firebase-oppsettet i
      <code>public/js/firebase-config.js</code>, slik det står i veiledningen <code>docs/firebase-oppsett.md</code>.</p>
    </div>`;
}

export function loggInn(main) {
  let modus = "inn"; // inn | ny | glemt

  const tegn = () => {
    const tittel = { inn: "Logg inn", ny: "Opprett konto", glemt: "Glemt passord" }[modus];
    main.innerHTML = html`
      <div class="sentrert kort">
        ${raw(logo)}
        <h1>${tittel}</h1>
        ${modus === "ny" ? raw(`<p class="hint">Bruk e-postadressen du er registrert med i klubben. Du får en e-post for å bekrefte adressen.</p>`) : ""}
        ${modus === "glemt" ? raw(`<p class="hint">Du får en e-post med lenke for å lage nytt passord.</p>`) : ""}
        <form id="skjema" class="skjema">
          <label>E-post<input name="epost" type="email" autocomplete="email" required></label>
          ${modus !== "glemt" ? raw(`<label>Passord<input name="passord" type="password" minlength="6" autocomplete="${modus === "ny" ? "new-password" : "current-password"}" required></label>`) : ""}
          ${modus === "ny" ? raw(`<label>Gjenta passord<input name="passord2" type="password" minlength="6" autocomplete="new-password" required></label>`) : ""}
          <button class="knapp bred" type="submit">${tittel}</button>
        </form>
        <div class="lenker">
          ${modus !== "inn" ? raw(`<button class="lenkeknapp" data-modus="inn">Tilbake til innlogging</button>`) : ""}
          ${modus === "inn" ? raw(`<button class="lenkeknapp" data-modus="glemt">Glemt passord?</button>
          <button class="lenkeknapp" data-modus="ny">Ny bruker? Opprett konto</button>`) : ""}
        </div>
      </div>`;

    main.querySelectorAll("[data-modus]").forEach((b) => b.addEventListener("click", () => { modus = b.dataset.modus; tegn(); }));
    const skjema = main.querySelector("#skjema");
    skjema.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(skjema));
      const knapp = skjema.querySelector("button[type=submit]");
      if (modus === "ny" && f.passord !== f.passord2) return melding("Passordene er ikke like.", "feil");
      await medKnapp(knapp, async () => {
        if (modus === "inn") await konto.loggInn(f.epost, f.passord);
        if (modus === "ny") await konto.opprettKonto(f.epost, f.passord);
        if (modus === "glemt") {
          await konto.glemtPassord(f.epost);
          melding("Sjekk e-posten din (også søppelpost).");
          modus = "inn";
          tegn();
        }
      });
    });
    skjema.querySelector("input")?.focus();
  };
  tegn();
}

export function bekreftEpost(main, S) {
  main.innerHTML = html`
    <div class="sentrert kort">
      ${raw(logo)}
      <h1>Bekreft e-posten din</h1>
      <p>Vi har sendt en e-post til <strong>${S.bruker.email}</strong>. Trykk på lenken i den, og kom tilbake hit.</p>
      <p class="hint">Finner du den ikke? Sjekk søppelpost.</p>
      <button class="knapp bred" id="ferdig">Jeg har bekreftet</button>
      <div class="lenker">
        <button class="lenkeknapp" id="paanytt">Send e-posten på nytt</button>
        <button class="lenkeknapp" id="ut">Logg ut</button>
      </div>
    </div>`;
  main.querySelector("#ferdig").addEventListener("click", (e) => medKnapp(e.currentTarget, async () => {
    const bruker = await konto.oppdater();
    if (!bruker.emailVerified) return melding("E-posten er ikke bekreftet ennå. Trykk på lenken i e-posten først.", "feil");
    startPaaNytt();
  }));
  main.querySelector("#paanytt").addEventListener("click", (e) => medKnapp(e.currentTarget, async () => {
    await konto.sendBekreftelsePaaNytt();
    melding("Ny e-post er sendt.");
  }));
  main.querySelector("#ut").addEventListener("click", () => konto.loggUt());
}

export function ingenTilgang(main, S) {
  const f = S.foresporsel;
  main.innerHTML = html`
    <div class="sentrert kort">
      ${raw(logo)}
      ${f ? raw(html`
        <h1>Forespørsel sendt</h1>
        <p>Kassereren har fått beskjed om at <strong>${f.navn}</strong> (${f.epost}) ønsker tilgang. Du kommer inn automatisk når den er godkjent.</p>`) : raw(html`
        <h1>Be om tilgang</h1>
        <p>Du er logget inn som <strong>${S.bruker.email}</strong>, men har ikke fått tilgang ennå. Skriv navnet ditt, så får kassereren beskjed.</p>
        <form id="skjema" class="skjema">
          <label>Fullt navn<input name="navn" autocomplete="name" required></label>
          <button class="knapp bred" type="submit">Be om tilgang</button>
        </form>`)}
      <div class="lenker"><button class="lenkeknapp" id="ut">Logg ut</button></div>
    </div>`;
  main.querySelector("#ut").addEventListener("click", () => konto.loggUt());
  const skjema = main.querySelector("#skjema");
  skjema?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const navn = new FormData(skjema).get("navn");
    await medKnapp(skjema.querySelector("button"), () => sendForesporsel(navn));
  });
}

export { feilmelding };
