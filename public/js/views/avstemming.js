// Avstemming: kassereren skriver inn saldoen fra bankens årsoppgave per konto og ser om den stemmer med regnskapet.

import { html, raw, kr, tolkBelop, belopTilInput, iDag, datoTekst } from "../util.js";
import { avstemming as avstem } from "../regnskap.js";
import { lagreInnstillinger, normalEpost } from "../firebase.js";
import { melding, medKnapp } from "../ui.js";
import { erKasserer } from "../tilgang.js";

/** Kort status for en konto: stemmer, avvik eller ikke lagt inn. */
export function avstemtTekst(k) {
  if (k.bank == null) return html`<span class="dempet">Ikke lagt inn</span>`;
  if (k.stemmer) return html`<span class="pluss">Stemmer</span>`;
  return html`<span class="minus">Avvik: ${kr(Math.abs(k.differanse))} ${k.differanse > 0 ? "for mye" : "for lite"} i regnskapet</span>`;
}

export function avstemming(main, S) {
  const aar = S.aar;
  const a = avstem(S.poster, S.innst, aar);
  const kasserer = erKasserer(S);

  const rad = (k) => html`
    <tr>
      <td>${k.navn}${k.kontonummer ? raw(html` <span class="dempet">(${k.kontonummer})</span>`) : ""}
        <span class="hint blokk">${k.antall} ${k.antall === 1 ? "post" : "poster"} i ${aar}</span></td>
      <td class="tall">${kr(k.beregnet)}</td>
      <td class="tall">${kasserer
        ? raw(html`<input data-konto="${k.id}" inputmode="decimal" placeholder="0,00" aria-label="Saldo for ${k.navn} fra årsoppgaven" value="${belopTilInput(k.bank)}">`)
        : k.bank == null ? "–" : kr(k.bank)}</td>
      <td class="tall" data-status="${k.id}">${raw(avstemtTekst(k))}</td>
    </tr>`;

  main.innerHTML = html`
    <div class="sidetopp">
      <h1>Avstemming ${aar}</h1>
      <a class="knapp sekundaer" href="#/rapport">Til årsrapporten</a>
    </div>
    <p class="hint">Når alt for ${aar} er ført, skriv inn saldoen per 31.12.${aar} fra årsoppgaven fra banken (og tell opp kontantkassa).
      Stemmer saldoen i regnskapet med banken for alle kontoene, stemmer regnskapet.
      ${kasserer ? "" : "Bare kassereren kan endre tallene."}</p>
    ${a.endret ? raw(html`<p class="hint">Sist lagret ${datoTekst(a.endret)}${a.endretAv ? ` av ${a.endretAv}` : ""}.</p>`) : ""}

    <form id="avstemming" class="skjema kort">
      <div class="tabell-rull">
      <table class="regnskap avstemming">
        <thead><tr><th>Konto</th><th class="tall">Regnskapet 31.12.</th><th class="tall">Årsoppgaven 31.12.</th><th class="tall">Status</th></tr></thead>
        <tbody>${a.kontoer.map((k) => raw(rad(k)))}</tbody>
      </table>
      </div>
      <div id="konklusjon"></div>
      <p class="hint">Er det avvik? Velg kontoen under <a href="#/poster">Poster</a> og sammenlign med kontoutskriften.
        Typiske feil er en post som mangler, et beløp som er tastet feil, feil konto eller feil år.</p>
      ${kasserer ? raw(`<div class="knapper"><button class="knapp" type="submit">Lagre avstemming</button></div>`) : ""}
    </form>`;

  const skjema = main.querySelector("#avstemming");
  const felter = () => [...skjema.querySelectorAll("input[data-konto]")];

  const konklusjon = (kontoer) => {
    const utfylt = kontoer.filter((k) => k.bank != null);
    const avvik = utfylt.filter((k) => !k.stemmer);
    const el = main.querySelector("#konklusjon");
    if (!utfylt.length) el.innerHTML = "";
    else if (avvik.length) el.innerHTML = html`<div class="varsel feil">Regnskapet stemmer ikke med banken for ${avvik.map((k) => k.navn).join(", ")}.</div>`;
    else if (utfylt.length < kontoer.length) el.innerHTML = html`<div class="varsel info">Det som er lagt inn, stemmer. Fyll inn årsoppgaven for de andre kontoene også.</div>`;
    else el.innerHTML = html`<div class="varsel ok">Regnskapet stemmer med banken for alle kontoene.</div>`;
  };

  // Regn ut status på nytt mens kassereren skriver.
  const lest = () => a.kontoer.map((k) => {
    const felt = skjema.querySelector(`input[data-konto="${k.id}"]`);
    if (!felt) return k;
    const bank = felt.value.trim() ? tolkBelop(felt.value) : null;
    return { ...k, bank, differanse: bank == null ? null : k.beregnet - bank, stemmer: bank == null ? null : k.beregnet === bank };
  });
  const oppdater = () => {
    const kontoer = lest();
    for (const k of kontoer) skjema.querySelector(`[data-status="${k.id}"]`).innerHTML = avstemtTekst(k);
    konklusjon(kontoer);
  };
  skjema.addEventListener("input", oppdater);
  konklusjon(a.kontoer);

  skjema.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!kasserer) return;
    const kontoer = {};
    for (const f of felter()) {
      if (!f.value.trim()) { kontoer[f.dataset.konto] = null; continue; }
      const belop = tolkBelop(f.value);
      if (belop == null) {
        f.focus();
        return melding("Sjekk beløpet. Det må være et tall, f.eks. 12 345,67 (minus foran hvis kontoen er i minus).", "feil");
      }
      kontoer[f.dataset.konto] = belop;
    }
    await medKnapp(e.submitter, async () => {
      await lagreInnstillinger({ avstemming: { [aar]: { kontoer, endret: iDag(), endretAv: S.profil?.navn || normalEpost(S.bruker.email) } } });
      melding(`Avstemmingen for ${aar} er lagret.`);
    });
  });
}
avstemming.live = false;
avstemming.tittel = "Avstemming";
avstemming.trenger = ["poster", "innst"];
