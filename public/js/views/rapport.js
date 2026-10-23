// Årsregnskap til årsmøtet, laget for utskrift (eller «Lagre som PDF»).

import { html, raw, kr, tall, datoTekst, lastNedCsv } from "../util.js";
import { aarsregnskap, sorterPoster, kontingentStatus, budsjettFor, kategorierFra, avvik, avstemming, nettoPerKategori } from "../regnskap.js";
import { avstemtTekst } from "./avstemming.js";
import { erKasserer } from "../tilgang.js";
import { kontotekst } from "./poster.js";
import { ikon } from "../ikoner.js";

let medBilagsliste = false;

export function rapport(main, S) {
  const r = aarsregnskap(S.poster, S.innst, S.aar);
  const k = kontingentStatus(S.medlemmer, S.aar);
  const forrige = aarsregnskap(S.poster, S.innst, S.aar - 1);
  const kolonner = resultatKolonner(S, r, forrige);
  const harBudsjett = kolonner.some((c) => c.id === "budsjett");
  const kasserer = erKasserer(S);
  const avst = avstemming(S.poster, S.innst, S.aar);
  const netto = nettoPerKategori(r);
  const bankKonto = new Map(avst.kontoer.map((k) => [k.id, k]));

  const celle = (c, v, bra) => raw(html`<td class="tall${c.dempet ? " dempet" : ""}${bra == null ? "" : bra ? " pluss" : " minus"}">${c.id === "avvik" ? fortegn(v) : kr(v)}</td>`);
  const tabell = (tittel, type) => {
    const kat = kategorier(S, type, kolonner);
    return html`
    <tr class="seksjon"><th colspan="${kolonner.length + 1}">${tittel}</th></tr>
    ${kat.length ? kat.map((navn) => raw(html`
      <tr><td>${navn}</td>${kolonner.map((c) => celle(c, c.verdi(type, navn), c.bra?.(type, navn)))}</tr>`))
      : raw(html`<tr><td class="dempet">Ingen</td>${kolonner.map((c) => celle(c, 0))}</tr>`)}
    <tr class="sum"><td>Sum ${tittel.toLowerCase()}</td>${kolonner.map((c) => celle(c, c.sum(type), c.braSum?.(type)))}</tr>`;
  };

  main.innerHTML = html`
    <div class="sidetopp ikke-utskrift">
      <h1>Årsrapport ${S.aar}</h1>
      <div class="knapperad">
        <label class="avkryss"><input type="checkbox" id="bilag" ${medBilagsliste ? "checked" : ""}> Ta med bilagsliste</label>
        ${kasserer ? raw(html`<a class="knapp sekundaer" href="#/budsjett/${S.aar}">${raw(ikon("poster"))} Budsjett</a>`) : ""}
        <a class="knapp sekundaer" href="#/avstemming">Avstemming</a>
        <button class="knapp sekundaer" id="eksport">${raw(ikon("lastned"))} Excel</button>
        <button class="knapp" id="skriv">${raw(ikon("skriver"))} Skriv ut / lagre PDF</button>
      </div>
    </div>
    <p class="hint ikke-utskrift">Tips: Velg «Lagre som PDF» i utskriftsvinduet for å sende rapporten på e-post.</p>
    ${kasserer && !harBudsjett ? raw(html`<p class="hint ikke-utskrift">Det er ikke lagt inn budsjett for ${S.aar}. <a href="#/budsjett/${S.aar}">Legg inn budsjett</a> for å se avviket mot regnskapet.</p>`) : ""}

    <article class="rapport">
      <header>
        <img src="icons/logo.svg" alt="" class="rapport-logo">
        <div>
          <h1>${S.innst.klubbnavn}</h1>
          <p>Regnskap for ${S.aar}${S.innst.orgnr ? ` · Org.nr. ${S.innst.orgnr}` : ""}</p>
        </div>
      </header>

      <h2>Resultatregnskap</h2>
      <div class="tabell-rull">
      <table class="regnskap">
        <thead><tr><th></th>${kolonner.map((c) => raw(html`<th class="tall${c.dempet ? " dempet" : ""}">${c.tittel}</th>`))}</tr></thead>
        <tbody>
          ${raw(tabell("Inntekter", "inntekt"))}
          ${raw(tabell("Utgifter", "utgift"))}
          <tr class="totalt"><td>Årsresultat</td>${kolonner.map((c) => celle(c, c.resultat, c.braResultat))}</tr>
        </tbody>
      </table>
      </div>
      ${harBudsjett ? raw(html`<p class="dempet liten">Avvik er regnskap minus budsjett. Grønt er bedre enn budsjettert (mer inntekt eller mindre utgift), rødt er dårligere.</p>`) : ""}

      ${netto.length ? raw(html`
        <h2>Arrangementer og kategorier med både inn og ut</h2>
        <table class="regnskap">
          <thead><tr><th></th><th class="tall">Inntekter</th><th class="tall">Utgifter</th><th class="tall">Sitter igjen med</th></tr></thead>
          <tbody>${netto.map((n) => raw(html`
            <tr><td>${n.kategori}</td><td class="tall">${kr(n.inn)}</td><td class="tall">${kr(n.ut)}</td>
            <td class="tall ${n.netto < 0 ? "minus" : "pluss"}">${fortegn(n.netto)}</td></tr>`))}</tbody>
        </table>`) : ""}

      <h2>Bank og kontanter</h2>
      <table class="regnskap">
        <thead><tr><th></th><th class="tall">1.1.${S.aar}</th><th class="tall">31.12.${S.aar}</th>${avst.finnes ? raw(`<th class="tall">Mot årsoppgaven</th>`) : ""}</tr></thead>
        <tbody>
          ${r.kontoer.map((k) => raw(html`
            <tr><td>${k.navn}${k.kontonummer ? raw(html` <span class="dempet">(${k.kontonummer})</span>`) : ""}</td>
            <td class="tall">${kr(k.inngaende)}</td><td class="tall">${kr(k.utgaende)}</td>
            ${avst.finnes ? raw(html`<td class="tall">${raw(avstemtTekst(bankKonto.get(k.id)))}</td>`) : ""}</tr>`))}
          <tr class="totalt"><td>Sum</td><td class="tall">${kr(r.inngaende)}</td><td class="tall">${kr(r.utgaende)}</td>${avst.finnes ? raw(`<td></td>`) : ""}</tr>
        </tbody>
      </table>
      <p class="dempet liten">Endring i året: ${kr(r.utgaende - r.inngaende)} (= årsresultat ${kr(r.resultat)}).
        ${avst.ferdig && avst.stemmer ? `Saldoene er avstemt mot bankens årsoppgave og stemmer.` : ""}</p>
      ${!avst.ferdig ? raw(html`<p class="hint ikke-utskrift">Saldoene er ikke avstemt mot bankens årsoppgave ennå. <a href="#/avstemming">Gå til avstemming</a>.</p>`) : ""}

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
  main.querySelector("#eksport").addEventListener("click", () => eksporter(S, kolonner));
  main.querySelector("#bilag").addEventListener("change", (e) => { medBilagsliste = e.target.checked; rapport(main, S); });
}
rapport.live = true;
rapport.tittel = "Årsrapport";
rapport.trenger = ["poster", "innst", "medlemmer"];

const fortegn = (oere) => (oere > 0 ? "+" : "") + kr(oere);

/**
 * Kolonnene i resultatregnskapet: regnskap for året, budsjett og avvik (hvis det finnes budsjett),
 * fjorårets regnskap (hvis det finnes poster) og neste års budsjett (hvis det er lagt inn).
 * Hver kolonne vet hvordan den henter tall per kategori, sum og resultat.
 */
export function resultatKolonner(S, r, forrige) {
  const fraRegnskap = (reg) => ({ inntekt: new Map(reg.inntekter), utgift: new Map(reg.utgifter) });
  const naa = fraRegnskap(r);
  const fjor = fraRegnskap(forrige);
  const b = budsjettFor(S.innst, S.aar);
  const neste = budsjettFor(S.innst, S.aar + 1);
  const sumAv = (reg) => (type) => (type === "inntekt" ? reg.sumInntekter : reg.sumUtgifter);
  const kolonner = [{
    id: "regnskap", tittel: `Regnskap ${S.aar}`, kart: naa,
    verdi: (type, kat) => naa[type].get(kat) || 0, sum: sumAv(r), resultat: r.resultat,
  }];
  if (b.finnes) {
    kolonner.push({
      id: "budsjett", tittel: `Budsjett ${S.aar}`, kart: b,
      verdi: (type, kat) => b[type].get(kat) || 0, sum: sumAv(b), resultat: b.resultat,
    });
    const bra = (type, f, bud) => avvik(type, f, bud).bra;
    kolonner.push({
      id: "avvik", tittel: "Avvik",
      verdi: (type, kat) => (naa[type].get(kat) || 0) - (b[type].get(kat) || 0),
      bra: (type, kat) => bra(type, naa[type].get(kat) || 0, b[type].get(kat) || 0),
      sum: (type) => sumAv(r)(type) - sumAv(b)(type),
      braSum: (type) => bra(type, sumAv(r)(type), sumAv(b)(type)),
      resultat: r.resultat - b.resultat, braResultat: r.resultat >= b.resultat,
    });
  }
  if (forrige.poster.length) {
    kolonner.push({
      id: "fjor", tittel: `Regnskap ${S.aar - 1}`, dempet: true, kart: fjor,
      verdi: (type, kat) => fjor[type].get(kat) || 0, sum: sumAv(forrige), resultat: forrige.resultat,
    });
  }
  if (neste.finnes) {
    kolonner.push({
      id: "neste", tittel: `Budsjett ${S.aar + 1}`, dempet: true, kart: neste,
      verdi: (type, kat) => neste[type].get(kat) || 0, sum: sumAv(neste), resultat: neste.resultat,
    });
  }
  return kolonner;
}

const kategorier = (S, type, kolonner) => kategorierFra(S.innst, type, ...kolonner.filter((c) => c.kart).map((c) => c.kart[type]));

/** Resultatregnskapet med budsjett og avvik som en fil til Excel. */
function eksporter(S, kolonner) {
  const tekst = (c, v) => tall(v);
  const rader = [["", ...kolonner.map((c) => c.tittel)]];
  for (const [tittel, type] of [["Inntekter", "inntekt"], ["Utgifter", "utgift"]]) {
    rader.push([tittel]);
    for (const kat of kategorier(S, type, kolonner)) rader.push([kat, ...kolonner.map((c) => tekst(c, c.verdi(type, kat)))]);
    rader.push([`Sum ${tittel.toLowerCase()}`, ...kolonner.map((c) => tekst(c, c.sum(type)))]);
    rader.push([]);
  }
  rader.push(["Årsresultat", ...kolonner.map((c) => tekst(c, c.resultat))]);
  lastNedCsv(`${S.innst.kortnavn || "TPTHK"}-arsrapport-${S.aar}.csv`, rader);
}
