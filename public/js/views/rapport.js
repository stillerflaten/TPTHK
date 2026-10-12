// Årsregnskap til årsmøtet, laget for utskrift (eller «Lagre som PDF»).

import { html, raw, kr, datoTekst } from "../util.js";
import { aarsregnskap, sorterPoster, kontingentStatus } from "../regnskap.js";

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
        <tbody>
          <tr><td>Inngående saldo 1.1.${S.aar}</td><td class="tall">${kr(r.inngaende)}</td></tr>
          <tr><td>Årsresultat</td><td class="tall">${kr(r.resultat)}</td></tr>
          <tr class="totalt"><td>Utgående saldo 31.12.${S.aar}</td><td class="tall">${kr(r.utgaende)}</td></tr>
        </tbody>
      </table>

      <h2>Medlemmer</h2>
      <p>${k.antall} aktive medlemmer, hvorav ${k.betalt} har betalt kontingent for ${S.aar}.</p>

      ${medBilagsliste ? raw(html`
        <h2 class="ny-side">Bilagsliste ${S.aar}</h2>
        <table class="regnskap bilagsliste">
          <thead><tr><th>Bilag</th><th>Dato</th><th>Tekst</th><th>Kategori</th><th class="tall">Beløp</th></tr></thead>
          <tbody>${[...sorterPoster(r.poster)].reverse().map((p) => raw(html`
            <tr><td>${p.bilagsnr}</td><td>${datoTekst(p.dato)}</td><td>${p.beskrivelse}</td><td>${p.kategori}</td>
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
