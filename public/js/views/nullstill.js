// Nullstille regnskapet etter en testperiode. Tar alltid en sikkerhetskopi først.
// Sletter postene (ett år eller alle), og rydder opp som når én post slettes. Medlemmer, søknader, kategorier,
// kontoer, startsaldo, budsjett, møter og regelverk beholdes.

import { html, raw } from "../util.js";
import { hentSamling, hentDokument, nullstillRegnskap } from "../firebase.js";
import { melding, medKnapp, dialog } from "../ui.js";
import { aarFor, medStandard } from "../regnskap.js";
import { lastNedSikkerhetskopi } from "./sikkerhetskopi.js";

const ORD = "NULLSTILL";

export function nullstillKort(S) {
  const aar = [...new Set(S.poster.map(aarFor))].filter(Boolean).sort((a, b) => b - a);
  return html`
    <section class="kort" id="nullstill">
      <h2>Nullstill regnskapet</h2>
      <p class="hint">Har dere prøvd nettsiden med ekte tall og vil begynne på nytt? Her sletter du alle poster for ett år eller alle år,
        med kvitteringene, avstemmingen og banktransaksjoner du har hoppet over. Det tas alltid en sikkerhetskopi først.
        Medlemmer, søknader, kategorier, kontoer, startsaldo, budsjett, møter og regelverk beholdes.</p>
      ${aar.length ? raw(html`
        <div class="knapper venstre">
          <select id="nullstillAar" aria-label="Hvilket år">
            <option value="alle">Alle år</option>
            ${aar.map((a) => raw(html`<option value="${a}">${a}</option>`))}
          </select>
          <button class="knapp farlig sekundaer" id="nullstillKnapp">Nullstill …</button>
        </div>
        <p class="hint" id="nullstillStatus" role="status"></p>`) : raw(`<p class="hint">Det er ingen poster i regnskapet nå.</p>`)}
    </section>`;
}

export function kobleNullstill(main, S) {
  const knapp = main.querySelector("#nullstillKnapp");
  if (!knapp) return;
  const status = main.querySelector("#nullstillStatus");
  const vis = (t) => { if (status) status.textContent = t; };

  knapp.addEventListener("click", (e) => medKnapp(e.currentTarget, async () => {
    if (!navigator.onLine) throw new Error("Du må være på nett for å nullstille regnskapet.");
    const valg = main.querySelector("#nullstillAar").value;
    const aar = valg === "alle" ? null : Number(valg);
    // Hentes fra serveren, så ingenting som bare ligger lokalt blir glemt.
    const [allePoster, soknader, medlemmer, klubb] = await Promise.all([
      hentSamling("poster"), hentSamling("soknader"), hentSamling("medlemmer"), hentDokument("innstillinger", "klubb"),
    ]);
    const poster = allePoster.filter((p) => aar == null || aarFor(p) === aar);
    visDialog(S, { poster, soknader, medlemmer, innst: medStandard(klubb), aar }, vis);
  }));
}

function visDialog(S, plan, vis) {
  const { poster, aar } = plan;
  const hva = aar == null ? "alle år" : String(aar);
  const forAar = aar == null ? "" : ` for ${aar}`;
  const kvitteringer = poster.filter((p) => !p.soknadId).reduce((n, p) => n + (p.kvitteringIds?.length || 0), 0);
  const fraSoknad = poster.filter((p) => p.soknadId).length;
  const kontingent = poster.filter((p) => p.kontingentAar).length;

  const d = dialog(html`
    <h2>Nullstille regnskapet for ${hva}?</h2>
    <p>Dette slettes:</p>
    <ul>
      <li><strong>${poster.length}</strong> ${poster.length === 1 ? "post" : "poster"}${kvitteringer ? ` med ${kvitteringer} ${kvitteringer === 1 ? "kvittering" : "kvitteringer"}` : ""}</li>
      <li>avstemmingen mot årsoppgaven${forAar}</li>
      <li>banktransaksjoner du har hoppet over${forAar}</li>
    </ul>
    ${fraSoknad ? raw(html`<p class="hint">${fraSoknad === 1 ? "1 søknad er ført som utbetalt. Den går" : `${fraSoknad} søknader er ført som utbetalt. De går`} tilbake til «Godkjent»
      og beholder kvitteringene, så du kan føre ${fraSoknad === 1 ? "den" : "dem"} på nytt.</p>`) : ""}
    ${kontingent ? raw(html`<p class="hint">${kontingent === 1 ? "1 kontingentbetaling er ført. Den merkes" : `${kontingent} kontingentbetalinger er ført. De merkes`} som ubetalt igjen.</p>`) : ""}
    <p class="hint">Først lastes en sikkerhetskopi ned. Ta vare på den: med den kan du legge tilbake det som ble slettet,
      under «Gjenopprett fra sikkerhetskopi».</p>
    <div class="skjema"><label>Skriv ${ORD} for å bekrefte<input id="nullstillOrd" autocomplete="off" autocapitalize="characters" spellcheck="false"></label></div>
    <div class="knapper">
      <button class="knapp sekundaer" data-lukk>Avbryt</button>
      <button class="knapp farlig" id="startNullstill" disabled>Ta sikkerhetskopi og nullstill</button>
    </div>`);

  const ord = d.querySelector("#nullstillOrd");
  const start = d.querySelector("#startNullstill");
  ord.addEventListener("input", () => { start.disabled = ord.value.trim().toUpperCase() !== ORD; });
  ord.focus();

  start.addEventListener("click", (e) => medKnapp(e.currentTarget, async () => {
    try {
      const { filnavn } = await lastNedSikkerhetskopi(S, vis);
      vis(`Sikkerhetskopien ${filnavn} er lastet ned. Sletter …`);
      await nullstillRegnskap(plan, (n) => vis(`Sletter … (${n})`));
      d.close();
      vis(`Ferdig. Sikkerhetskopien fra før nullstillingen heter ${filnavn}.`);
      melding(`Regnskapet for ${hva} er nullstilt.`);
    } catch (err) {
      vis("");
      throw err;
    }
  }));
}
