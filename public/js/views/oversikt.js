// Forsiden for kassereren: saldo, årets tall og det som venter.

import { html, raw, kr, datoTekst } from "../util.js";
import { saldoNaa, aarsregnskap, sorterPoster, kontingentStatus } from "../regnskap.js";
import { belopHtml } from "./poster.js";
import { ikon } from "../ikoner.js";

export function oversikt(main, S) {
  const r = aarsregnskap(S.poster, S.innst, S.aar);
  const k = kontingentStatus(S.medlemmer, S.aar);
  const venter = S.soknader.filter((s) => s.status === "sendt" || s.status === "godkjent");
  const siste = sorterPoster(r.poster).slice(0, 6);
  const stoerst = Math.max(1, ...r.inntekter.map(([, v]) => v), ...r.utgifter.map(([, v]) => v));
  const stolper = (rader, type) => rader.map(([kat, v]) => html`
    <div class="stolpe-rad">
      <span class="stolpe-navn">${kat}</span>
      <span class="stolpe"><span class="stolpe-fyll ${type}" style="width:${Math.max(2, (v / stoerst) * 100).toFixed(1)}%"></span></span>
      <span class="stolpe-tall">${kr(v)}</span>
    </div>`).join("") || `<p class="hint">Ingen ${type === "inntekt" ? "inntekter" : "utgifter"} ført i ${S.aar}.</p>`;

  main.innerHTML = html`
    <div class="sidetopp">
      <h1>Oversikt ${S.aar}</h1>
      <a class="knapp" href="#/post/ny">+ Ny post</a>
    </div>

    ${venter.length ? raw(html`
      <a class="varsel info lenke" href="#/soknader">${raw(ikon("soknader"))} ${venter.length} ${venter.length === 1 ? "søknad venter" : "søknader venter"} på behandling eller utbetaling</a>`) : ""}
    ${S.foresporsler.length ? raw(html`
      <a class="varsel info lenke" href="#/medlemmer">${raw(ikon("person"))} ${S.foresporsler.length} ${S.foresporsler.length === 1 ? "person ber" : "personer ber"} om tilgang</a>`) : ""}

    <div class="nokkeltall">
      <div class="tallkort"><span class="etikett">Saldo nå</span><span class="verdi">${kr(saldoNaa(S.poster, S.innst))}</span></div>
      <div class="tallkort"><span class="etikett">Inntekter ${S.aar}</span><span class="verdi pluss">${kr(r.sumInntekter)}</span></div>
      <div class="tallkort"><span class="etikett">Utgifter ${S.aar}</span><span class="verdi minus">${kr(r.sumUtgifter)}</span></div>
      <div class="tallkort"><span class="etikett">Resultat ${S.aar}</span><span class="verdi ${r.resultat < 0 ? "minus" : "pluss"}">${kr(r.resultat)}</span></div>
    </div>

    ${S.innst.kontoer.length > 1 ? raw(html`
      <div class="kontosaldo">${S.innst.kontoer.map((konto) => raw(html`
        <div><span class="etikett">${konto.navn}</span><strong>${kr(saldoNaa(S.poster, S.innst, konto.id))}</strong></div>`))}
      </div>`) : ""}

    <div class="rutenett">
      <section class="kort">
        <h2>Inntekter per kategori</h2>
        ${raw(stolper(r.inntekter, "inntekt"))}
        <h2>Utgifter per kategori</h2>
        ${raw(stolper(r.utgifter, "utgift"))}
      </section>

      <section class="kort">
        <h2>Kontingent ${S.aar}</h2>
        ${k.antall ? raw(html`
          <div class="fremdrift"><span style="width:${((k.betalt / k.antall) * 100).toFixed(0)}%"></span></div>
          <p><strong>${k.betalt}</strong> av ${k.antall} aktive medlemmer har betalt. <a href="#/medlemmer">Se medlemmer</a></p>`)
          : raw(`<p class="hint">Ingen medlemmer registrert ennå. <a href="#/medlemmer">Legg til medlemmer</a></p>`)}

        <h2>Siste poster</h2>
        ${siste.length ? raw(`<ul class="postliste kompakt">${siste.map((p) => html`
          <li><a href="#/post/${p.id}">
            <span class="post-dato">${datoTekst(p.dato)}</span>
            <span class="post-tekst">${p.beskrivelse || p.kategori || "Overføring"}</span>
            ${raw(belopHtml(p, S.innst))}
          </a></li>`).join("")}</ul><a href="#/poster">Se alle poster</a>`)
          : raw(`<p class="hint">Ingen poster i ${S.aar} ennå.</p>`)}
      </section>
    </div>`;
}
oversikt.live = true;
oversikt.tittel = "Oversikt";
oversikt.trenger = ["poster", "innst", "medlemmer", "soknader", "foresporsler"];
