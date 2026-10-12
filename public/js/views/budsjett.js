// Budsjett: kassereren legger inn budsjettert beløp per kategori for et år. Vises mot regnskapet i årsrapporten.

import { html, raw, kr, tolkBelop, belopTilInput, iDag, datoTekst } from "../util.js";
import { aarsregnskap, budsjettFor, kategorierFra } from "../regnskap.js";
import { lagreInnstillinger, normalEpost } from "../firebase.js";
import { melding, medKnapp, bekreft } from "../ui.js";
import { gaaTil } from "../app.js";
import { erKasserer } from "../tilgang.js";

const TYPER = [["inntekt", "Inntekter"], ["utgift", "Utgifter"]];

export function budsjett(main, S) {
  if (!erKasserer(S)) return gaaTil("rapport");
  const aar = S.aar;
  const b = budsjettFor(S.innst, aar);
  const fjorBudsjett = budsjettFor(S.innst, aar - 1);
  const fjor = aarsregnskap(S.poster, S.innst, aar - 1);
  const fjorKart = { inntekt: new Map(fjor.inntekter), utgift: new Map(fjor.utgifter) };
  const nesteAar = new Date().getFullYear() + 1;

  // Kategoriene fra innstillingene, pluss gamle kategorier som fortsatt har budsjett.
  const kategorier = (type) => kategorierFra(S.innst, type, new Map(S.innst.kategorier[type].map((k) => [k, 0])), b[type]);

  const rad = (type, kat) => html`
    <label class="budsjett-rad">
      <span>${kat}${!S.innst.kategorier[type].includes(kat) ? raw(` <span class="hint">(fjernet fra kategoriene)</span>`) : ""}
        ${fjorKart[type].get(kat) ? raw(html`<span class="hint">Regnskap ${aar - 1}: ${kr(fjorKart[type].get(kat))}</span>`) : ""}</span>
      <input data-type="${type}" data-kategori="${kat}" inputmode="decimal" placeholder="0"
        value="${belopTilInput(b[type].get(kat) || null)}">
    </label>`;

  main.innerHTML = html`
    <div class="sidetopp">
      <h1>Budsjett ${aar}</h1>
      <div class="knapperad">
        ${aar < nesteAar ? raw(html`<button class="knapp sekundaer" id="neste">Lag budsjett for ${nesteAar}</button>`) : ""}
        <a class="knapp sekundaer" href="#/rapport">Til årsrapporten</a>
      </div>
    </div>
    <p class="hint">Skriv inn hva dere regner med å få inn og bruke i ${aar}, per kategori. Tomme felt teller som 0.
      Årsrapporten viser budsjettet ved siden av regnskapet, med avviket. Styret og revisor kan se det, men bare kassereren kan endre det.
      Bytt år øverst for å lage budsjett for et annet år.</p>
    ${b.endret ? raw(html`<p class="hint">Sist lagret ${datoTekst(b.endret)}${b.endretAv ? ` av ${b.endretAv}` : ""}.</p>`) : ""}

    <form id="budsjett" class="skjema kort">
      ${fjor.poster.length || fjorBudsjett.finnes ? raw(html`
        <div class="knapperad">
          ${fjor.poster.length ? raw(html`<button type="button" class="knapp sekundaer liten" id="fraRegnskap">Fyll inn fra regnskapet ${aar - 1}</button>`) : ""}
          ${fjorBudsjett.finnes ? raw(html`<button type="button" class="knapp sekundaer liten" id="fraBudsjett">Kopier budsjettet for ${aar - 1}</button>`) : ""}
        </div>`) : ""}
      ${TYPER.map(([type, tittel]) => raw(html`
        <h2>${tittel}</h2>
        ${kategorier(type).map((kat) => raw(rad(type, kat)))}
        <div class="budsjett-rad sum"><span>Sum ${tittel.toLowerCase()}</span><strong data-sum="${type}"></strong></div>`))}
      <div class="budsjett-rad totalt"><span>Budsjettert resultat</span><strong id="resultat"></strong></div>
      <p class="hint">Nye kategorier legger du til under <a href="#/innstillinger">Innstillinger</a>.</p>
      <div class="knapper"><button class="knapp" type="submit">Lagre budsjett</button></div>
    </form>`;

  const skjema = main.querySelector("#budsjett");
  const felter = () => [...skjema.querySelectorAll("input[data-type]")];

  const oppdaterSummer = () => {
    const sum = { inntekt: 0, utgift: 0 };
    for (const f of felter()) sum[f.dataset.type] += tolkBelop(f.value) || 0;
    for (const [type] of TYPER) skjema.querySelector(`[data-sum=${type}]`).textContent = kr(sum[type]);
    const res = sum.inntekt - sum.utgift;
    const el = skjema.querySelector("#resultat");
    el.textContent = kr(res);
    el.className = res < 0 ? "minus" : "";
  };
  skjema.addEventListener("input", oppdaterSummer);
  oppdaterSummer();

  const fyll = async (kilde, tekst) => {
    if (felter().some((f) => f.value.trim()) && !(await bekreft(`${tekst} Tallene du har skrevet inn, blir byttet ut.`, { ja: "Fyll inn" }))) return;
    for (const f of felter()) f.value = belopTilInput(kilde[f.dataset.type].get(f.dataset.kategori) || null);
    oppdaterSummer();
  };
  main.querySelector("#fraRegnskap")?.addEventListener("click", () => fyll(fjorKart, `Fylle inn med regnskapet for ${aar - 1}?`));
  main.querySelector("#fraBudsjett")?.addEventListener("click", () => fyll(fjorBudsjett, `Kopiere budsjettet for ${aar - 1}?`));
  main.querySelector("#neste")?.addEventListener("click", () => { S.aar = nesteAar; gaaTil("budsjett"); });

  skjema.addEventListener("submit", async (e) => {
    e.preventDefault();
    const ny = { inntekt: [], utgift: [] };
    for (const f of felter()) {
      if (!f.value.trim()) continue;
      const belop = tolkBelop(f.value);
      if (belop == null || belop < 0) {
        f.focus();
        return melding(`Sjekk beløpet for «${f.dataset.kategori}». Det må være et tall.`, "feil");
      }
      if (belop > 0) ny[f.dataset.type].push({ kategori: f.dataset.kategori, belop });
    }
    await medKnapp(e.submitter, async () => {
      await lagreInnstillinger({ budsjett: { [aar]: { ...ny, endret: iDag(), endretAv: S.profil?.navn || normalEpost(S.bruker.email) } } });
      melding(`Budsjettet for ${aar} er lagret.`);
      gaaTil("rapport");
    });
  });
}
budsjett.live = false;
budsjett.tittel = "Budsjett";
budsjett.trenger = ["poster", "innst"];
