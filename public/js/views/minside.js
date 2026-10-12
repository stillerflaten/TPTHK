// «Min side» for medlemmer: kontingentstatus, betalingsinfo og egne opplysninger.

import { html, raw, kr, aarNaa, datoTekst } from "../util.js";
import { konto, oppdaterMinProfil } from "../firebase.js";
import { melding, medKnapp } from "../ui.js";
import { gyldigKontonummer } from "./soknader.js";
import { supportKort, kobleSupport } from "./support.js";

export function minside(main, S) {
  const aar = aarNaa();
  const k = S.mittMedlem?.kontingent?.[aar];
  const info = S.info || {};
  main.innerHTML = html`
    <div class="sidetopp"><h1>Min side</h1></div>

    <section class="kort">
      <h2>Kontingent ${aar}</h2>
      ${!S.mittMedlem ? raw(`<p class="hint">Kassereren har ikke koblet deg til medlemslisten ennå.</p>`)
        : k?.betalt ? raw(html`<p class="status status-utbetalt">✓ Betalt ${datoTekst(k.dato)}</p>`)
        : raw(html`<p class="status status-sendt">Ikke registrert som betalt</p>
          ${info.kontingentBelop ? raw(html`<p>Kontingenten er <strong>${kr(info.kontingentBelop)}</strong>.</p>`) : ""}
          ${info.kontonummer ? raw(html`<p>Klubbens kontonummer: <strong>${info.kontonummer}</strong></p>`) : ""}
          ${info.betalingsinfo ? raw(html`<p class="fritekst">${info.betalingsinfo}</p>`) : ""}
          <p class="hint">Har du betalt nylig? Det kan ta litt tid før kassereren registrerer det.</p>`)}
    </section>

    ${raw(supportKort(S))}

    <form id="profil" class="skjema kort">
      <h2>Mine opplysninger</h2>
      <p class="hint">Innlogget som ${S.bruker.email}</p>
      <label>Navn<input name="navn" value="${S.profil.navn || ""}" autocomplete="name" required></label>
      <label>Kontonummer for refusjoner<input name="kontonummer" inputmode="numeric" value="${S.profil.kontonummer || ""}"></label>
      <div class="knapper">
        <button type="button" class="knapp sekundaer" id="passord">Bytt passord</button>
        <button type="submit" class="knapp">Lagre</button>
      </div>
    </form>`;

  kobleSupport(main, S);
  const f = main.querySelector("#profil");
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f));
    const kontonr = v.kontonummer.replace(/\D/g, "");
    if (kontonr && !gyldigKontonummer(kontonr)) return melding("Kontonummeret ser ikke riktig ut.", "feil");
    await medKnapp(e.submitter, async () => {
      await oppdaterMinProfil({ navn: v.navn.trim(), kontonummer: kontonr });
      melding("Lagret.");
    });
  });
  main.querySelector("#passord").addEventListener("click", (e) => medKnapp(e.currentTarget, async () => {
    await konto.glemtPassord(S.bruker.email);
    melding("Du har fått en e-post med lenke for å lage nytt passord.");
  }));
}
minside.tittel = "Min side";
minside.trenger = ["info", "mittMedlem"];
