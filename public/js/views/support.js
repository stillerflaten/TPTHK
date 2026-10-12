// Support: kasserer eller styret ber om hjelp, og administratoren får full tilgang i 24 timer.
// Selve tidsgrensen håndheves i firestore.rules. Her vises bare status og knapper.

import { html, raw } from "../util.js";
import { startSupport, avsluttSupport, SUPPORT_TIMER } from "../firebase.js";
import { melding, medKnapp, bekreft } from "../ui.js";
import { supportPaagaar, kanBeOmSupport } from "../tilgang.js";

const tidFormat = new Intl.DateTimeFormat("nb-NO", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
export const tidTekst = (ms) => tidFormat.format(new Date(ms));

const hvem = (s, felt) => s[`${felt}AvNavn`] || s[`${felt}Av`] || "";

/** Skal kortet vises for denne personen? */
export const visSupport = (S) => kanBeOmSupport(S) || S.profil?.admin === true;

/** Kortet med status og knapper. Tom streng for dem som ikke har noe med support å gjøre. */
export function supportKort(S) {
  if (!visSupport(S)) return "";
  const s = S.support;
  const aktiv = supportPaagaar(S);
  const admin = S.profil?.admin === true;

  if (aktiv) {
    return html`
      <section class="kort uthevet" id="support">
        <h2>Support er aktiv</h2>
        <p>${admin ? "Du har full tilgang" : "Administratoren har full tilgang til regnskapet og alt annet"}
          til <strong>${tidTekst(s.utloper)}</strong>.</p>
        <p class="hint">Bedt om av ${hvem(s, "startet")}. Tilgangen stenges av seg selv når tiden er ute.</p>
        <div class="knapper venstre">
          <button class="knapp sekundaer" id="avsluttSupport">${admin ? "Jeg er ferdig, avslutt support" : "Avslutt support nå"}</button>
          ${!admin ? raw(`<button class="knapp sekundaer" id="startSupport">Gi 24 nye timer</button>`) : ""}
        </div>
      </section>`;
  }

  const sist = s?.startet ? raw(html`<p class="hint">Sist brukt: ${tidTekst(s.startet)}, bedt om av ${hvem(s, "startet")}${s.avsluttet ? `, avsluttet ${tidTekst(s.avsluttet)}` : ""}.</p>`) : "";
  if (admin) {
    return html`
      <section class="kort" id="support">
        <h2>Support</h2>
        <p>Du har vanlig medlemstilgang. Når kassereren eller styret ber om support, får du full tilgang i ${SUPPORT_TIMER} timer.</p>
        ${sist}
      </section>`;
  }
  return html`
    <section class="kort" id="support">
      <h2>Trenger dere hjelp?</h2>
      <p>Administratoren (den som drifter nettsiden) ser ikke regnskapet til vanlig. Trykker du på knappen, får hen
        full tilgang i ${SUPPORT_TIMER} timer, så hen kan hjelpe dere. Dere kan avslutte tidligere.</p>
      ${sist}
      <div class="knapper venstre"><button class="knapp" id="startSupport">Be om support i ${SUPPORT_TIMER} timer</button></div>
      <p class="hint">Gi gjerne beskjed til administratoren om hva dere trenger hjelp med.</p>
    </section>`;
}

/** Tegner bare supportkortet på nytt, for sider som ellers ikke tegnes på nytt (skjemaer under utfylling). */
export function oppdaterSupportKort(main, S) {
  const gammelt = main.querySelector("#support");
  if (!gammelt) return;
  const ny = supportKort(S);
  if (gammelt.outerHTML === ny.trim()) return;
  gammelt.outerHTML = ny;
  kobleSupport(main, S);
}

export function kobleSupport(main, S) {
  main.querySelector("#startSupport")?.addEventListener("click", async (e) => {
    const knapp = e.currentTarget;
    if (!(await bekreft(`Gi administratoren full tilgang til regnskapet, medlemslisten og alt annet i ${SUPPORT_TIMER} timer?`, { ja: "Be om support" }))) return;
    await medKnapp(knapp, async () => {
      await startSupport(S.profil?.navn);
      melding(`Support er aktiv i ${SUPPORT_TIMER} timer.`);
    });
  });
  main.querySelector("#avsluttSupport")?.addEventListener("click", async (e) => {
    const knapp = e.currentTarget;
    if (!(await bekreft("Avslutte support nå? Administratoren mister tilgangen med en gang.", { ja: "Avslutt" }))) return;
    await medKnapp(knapp, async () => {
      await avsluttSupport();
      melding("Support er avsluttet.");
    });
  });
}

/** Stripe øverst på sidene mens support pågår, så ingen glemmer at den er på. */
export function supportStripe(S, lenke) {
  if (!supportPaagaar(S) || !visSupport(S)) return "";
  const tekst = S.profil?.admin === true ? "Support er aktiv. Du har full tilgang til" : "Support er aktiv. Administratoren har full tilgang til";
  return html`<a class="varsel info lenke" href="#/${lenke}">${tekst} ${tidTekst(S.support.utloper)}.</a>`;
}
