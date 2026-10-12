// Årsregnskap til årsmøtet, laget for utskrift (eller «Lagre som PDF»).

import { html, raw, kr, datoTekst } from "../util.js";
import { aarsregnskap, sorterPoster, kontingentStatus } from "../regnskap.js";
import { kontotekst } from "./poster.js";

let medBilagsliste = false;

export function rapport(main, S) {
  const r = aarsregnskap(S.poster, S.innst, S.aar);
  const k = kontingentStatus(S.medlemmer, S.aar);
  const forrige = aarsregnskap(S.poster, S.innst, S.aar - 1);
  const harForrige = forrige.poster.length > 0;
  const forrigeVerdi = (liste, kat) => liste.find(([k]) => k === kat)?.[1] || 0;

  const tabell = (tittel, rader, sum, forrigeRader, forrigeSum) => html`
    <tr class="seksjon"><th colspan="${harForrige ? 3 : 2}">${tittel}</th></tr>
    ${rader.length ? rader.map(([kat, v]) => raw(html`
      <tr><td>${kat}</td><td class="tall">${kr(v)}</td>${harForrige ? raw(html`<td class="tall dempet">${kr(forrigeVerdi(forrigeRader, kat))}</td>`) : ""}</tr>`))
      : raw(`<tr><td class="dempet">Ingen</td><td class="tall">${kr(0)}</td>${harForrige ? "<td></td>" : ""}</tr>`)}
    <tr class="sum"><td>Sum ${tittel.toLowerCase()}</td><td class="tall">${kr(sum)}</td>${harForrige ? raw(html`<td class="tall dempet">${kr(forrigeSum)}</td>`) : ""}</tr>`;

  main.innerHTML = html`
    <div class="sidetopp ikke-utskrift">
      <h1>Årsrapport ${S.aar}</h1>
      <div class="knapperad">
        <label class="avkryss"><input type="checkbox" id="bilag" ${medBilagsliste ? "checked" : ""}> Ta med bilagsliste</label>
        <button class="knapp" id="skriv">🖨 Skriv ut / lagre PDF</button>
      </div>
    </div>
    <p class="hint ikke-utskrift">Tips: Velg «Lagre som PDF» i utskriftsvinduet for å sende rapporten på e-post.</p>

    <article class="rapport">
      <header>
        <img src="icons/logo.svg" alt="" class="rapport-logo">
        <div>
          <h1>${S.innst.klubbnavn}</h1>
          <p>Regnskap for ${S.aar}${S.innst.orgnr ? ` · Org.nr. ${S.innst.orgnr}` : ""}</p>
        </div>
      </header>

      <h2>Resultatregnskap</h2>
      <table class="regnskap">
        <thead><tr><th></th><th class="tall">${S.aar}</th>${harForrige ? raw(html`<th class="tall dempet">${S.aar - 1}</th>`) : ""}</tr></thead>
        <tbody>
          ${raw(tabell("Inntekter", r.inntekter, r.sumInntekter, forrige.inntekter, forrige.sumInntekter))}
          ${raw(tabell("Utgifter", r.utgifter, r.sumUtgifter, forrige.utgifter, forrige.sumUtgifter))}
          <tr class="totalt"><td>Årsresultat</td><td class="tall">${kr(r.resultat)}</td>${harForrige ? raw(html`<td class="tall dempet">${kr(forrige.resultat)}</td>`) : ""}</tr>
        </tbody>
      </table>

      <h2>Bank og kontanter</h2>
      <table class="regnskap">
        <thead><tr><th></th><th class="tall">1.1.${S.aar}</th><th class="tall">31.12.${S.aar}</th></tr></thead>
        <tbody>
          ${r.kontoer.map((k) => raw(html`
            <tr><td>${k.navn}${k.kontonummer ? raw(html` <span class="dempet">(${k.kontonummer})</span>`) : ""}</td>
            <td class="tall">${kr(k.inngaende)}</td><td class="tall">${kr(k.utgaende)}</td></tr>`))}
          <tr class="totalt"><td>Sum</td><td class="tall">${kr(r.inngaende)}</td><td class="tall">${kr(r.utgaende)}</td></tr>
        </tbody>
      </table>
      <p class="dempet liten">Endring i året: ${kr(r.utgaende - r.inngaende)} (= årsresultat ${kr(r.resultat)}).</p>

      <h2>Medlemmer</h2>
      <p>${k.antall} aktive medlemmer, hvorav ${k.betalt} har betalt kontingent for ${S.aar}.</p>

      ${medBilagsliste ? raw(html`
        <h2 class="ny-side">Bilagsliste ${S.aar}</h2>
        <table class="regnskap bilagsliste">
          <thead><tr><th>Dato</th><th>Bilag</th><th>Tekst</th><th>Kategori</th>${r.kontoer.length > 1 ? raw("<th>Konto</th>") : ""}<th class="tall">Beløp</th></tr></thead>
          <tbody>${[...sorterPoster(r.poster)].reverse().map((p) => raw(html`
            <tr><td>${datoTekst(p.dato)}</td><td>${p.bilagsnr}</td><td>${p.beskrivelse}</td><td>${p.type === "overforing" ? "Overføring" : p.kategori}</td>
            ${r.kontoer.length > 1 ? raw(html`<td>${kontotekst(p, S.innst)}</td>`) : ""}
            <td class="tall">${p.type === "utgift" ? "−" : ""}${kr(p.belop)}</td></tr>`))}</tbody>
        </table>`) : ""}

      <div class="signaturer">
        <div><span class="linje"></span>Sted og dato</div>
        <div><span class="linje"></span>Kasserer</div>
        <div><span class="linje"></span>Revisor</div>
      </div>
    </article>`;

  main.querySelector("#skriv").addEventListener("click", () => window.print());
  main.querySelector("#bilag").addEventListener("change", (e) => { medBilagsliste = e.target.checked; rapport(main, S); });
}
rapport.live = true;
rapport.tittel = "Årsrapport";
rapport.trenger = ["poster", "innst", "medlemmer"];
