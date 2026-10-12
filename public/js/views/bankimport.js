// Import av kontoutskrift: kassereren laster opp fila fra nettbanken, går gjennom transaksjonene og fører dem én og én.

import { html, raw, kr, datoTekst } from "../util.js";
import { kontonavn } from "../regnskap.js";
import { lesFil, finnKolonner, lagTransaksjoner, vurder } from "../bankimport.js";
import { lagrePost, kobleTilBank, hoppOverBank } from "../firebase.js";
import { melding, medKnapp, dialog, kvitteringsvelger } from "../ui.js";
import { ikon } from "../ikoner.js";

// Fila som er lest inn, huskes mens appen er åpen, så kassereren kan gå til en post og tilbake.
const T = { konto: "", filnavn: "", rader: [], kol: null, transaksjoner: [], hoppetOver: 0, fane: "fore", feil: "" };

const fortegn = (oere) => html`<span class="post-belop ${oere < 0 ? "minus" : "pluss"}">${oere < 0 ? "−" : "+"}${kr(Math.abs(oere))}</span>`;

export function bankimport(main, S) {
  const kontoer = S.innst.kontoer;
  if (!kontoer.some((k) => k.id === T.konto)) T.konto = kontoer[0].id;
  const status = vurder(T.transaksjoner, S.poster, S.innst, T.konto, S.innst.bankHoppet || {});
  // Transaksjoner før startdatoen er med i startsaldoen, og skal ikke føres.
  for (const t of T.transaksjoner) if (t.dato < S.innst.startDato && status.get(t.id).status === "ny") status.set(t.id, { status: "forStart" });

  const fore = T.transaksjoner.filter((t) => ["ny", "kanskje"].includes(status.get(t.id).status));
  const nye = fore.filter((t) => status.get(t.id).status === "ny");
  const ferdige = T.transaksjoner.filter((t) => !fore.includes(t));
  const synlige = T.fane === "fore" ? fore : T.fane === "ferdig" ? ferdige : T.transaksjoner;
  const datoer = T.transaksjoner.map((t) => t.dato).sort();

  main.innerHTML = html`
    <div class="sidetopp">
      <h1>Importer fra banken</h1>
      <a class="lenkeknapp" href="#/poster">Tilbake</a>
    </div>

    <section class="kort skjema">
      ${kontoer.length > 1 ? raw(html`<label>Hvilken konto er kontoutskriften fra?<select id="konto">
        ${kontoer.map((k) => raw(html`<option value="${k.id}" ${k.id === T.konto ? "selected" : ""}>${k.navn}${k.kontonummer ? ` (${k.kontonummer})` : ""}</option>`))}
      </select></label>`) : ""}
      <label class="knapp sekundaer filknapp">
        ${raw(ikon("opplast"))} ${T.filnavn ? "Velg en annen fil" : "Velg fil fra nettbanken"}
        <input type="file" id="fil" accept=".csv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden>
      </label>
      <p class="hint">I Nordea nettbank: åpne kontoen, velg perioden og trykk «Eksporter» eller «Last ned» (CSV eller Excel).
        Fila leses bare her i nettleseren. Ingenting lagres før du fører en post.</p>
      ${T.feil ? raw(html`<div class="varsel feil">${T.feil}</div>`) : ""}
      ${T.filnavn && T.kol ? raw(html`<p class="hint"><strong>${T.filnavn}</strong>: ${T.transaksjoner.length} transaksjoner
        ${datoer.length ? `fra ${datoTekst(datoer[0])} til ${datoTekst(datoer.at(-1))}` : ""}.
        ${T.hoppetOver ? `${T.hoppetOver} ${T.hoppetOver === 1 ? "rad" : "rader"} uten dato eller beløp (f.eks. reserverte beløp eller summer) er ikke tatt med.` : ""}</p>`) : ""}
      ${T.rader.length ? raw(kolonnevalg()) : ""}
    </section>

    ${T.transaksjoner.length ? raw(html`
      <div class="faner">
        <button data-fane="fore" class="${T.fane === "fore" ? "valgt" : ""}">Å føre (${fore.length})</button>
        <button data-fane="ferdig" class="${T.fane === "ferdig" ? "valgt" : ""}">Ført eller hoppet over (${ferdige.length})</button>
        <button data-fane="alle" class="${T.fane === "alle" ? "valgt" : ""}">Alle</button>
      </div>
      ${synlige.length ? raw(html`<ul class="postliste bankliste">${synlige.map((t) => raw(rad(t, status.get(t.id), S)))}</ul>`)
        : raw(html`<div class="tom">${T.fane === "fore" ? "Alt i kontoutskriften er ført. Bra jobbet!" : "Ingenting her ennå."}</div>`)}`)
      : ""}`;

  main.querySelector("#konto")?.addEventListener("change", async (e) => {
    T.konto = e.target.value;
    await lagListe();
    bankimport(main, S);
  });
  main.querySelector("#fil").addEventListener("change", async (e) => {
    const fil = e.target.files[0];
    if (!fil) return;
    T.feil = "";
    try {
      T.rader = await lesFil(fil);
      T.filnavn = fil.name;
      T.kol = finnKolonner(T.rader);
      if (!T.kol) T.feil = "Fant ikke kolonnene for dato og beløp automatisk. Velg dem under «Kolonner».";
      T.fane = "fore";
      await lagListe();
    } catch (feil) {
      console.error(feil);
      Object.assign(T, { rader: [], kol: null, transaksjoner: [], filnavn: "", feil: feil.message || "Klarte ikke å lese fila." });
    }
    bankimport(main, S);
  });
  main.querySelector("#kolonner")?.addEventListener("change", async (e) => {
    const k = e.currentTarget;
    const verdi = (navn) => Number(k.querySelector(`[name=${navn}]`).value);
    T.kol = {
      overskrift: verdi("overskrift"), dato: verdi("dato"), belop: verdi("belop"), inn: verdi("inn"), ut: verdi("ut"),
      tekst: [verdi("tekst"), verdi("tekst2")].filter((x) => x >= 0), ref: -1,
    };
    T.feil = T.kol.dato < 0 || (T.kol.belop < 0 && (T.kol.inn < 0 || T.kol.ut < 0)) ? "Velg kolonne for dato og for beløp (eller både inn og ut)." : "";
    await lagListe();
    bankimport(main, S);
    main.querySelector("#kolonner").open = true;
  });
  main.querySelectorAll("[data-fane]").forEach((b) => b.addEventListener("click", () => { T.fane = b.dataset.fane; bankimport(main, S); }));

  const finn = (el) => T.transaksjoner.find((t) => t.id === el.closest("[data-id]").dataset.id);
  main.querySelectorAll("[data-for]").forEach((b) => b.addEventListener("click", () => forDialog(S, finn(b), nye)));
  main.querySelectorAll("[data-hopp]").forEach((b) => b.addEventListener("click", () =>
    medKnapp(b, () => hoppOverBank(finn(b).id, b.dataset.hopp === "ja"))));
  main.querySelectorAll("[data-koble]").forEach((b) => b.addEventListener("click", () =>
    medKnapp(b, async () => {
      const t = finn(b);
      await kobleTilBank(status.get(t.id).post.id, T.konto, t.id);
      melding("Merket som ført.");
    })));
}
bankimport.live = true;
bankimport.tittel = "Importer fra banken";
bankimport.trenger = ["poster", "innst"];

async function lagListe() {
  if (!T.kol || T.kol.dato < 0 || (T.kol.belop < 0 && (T.kol.inn < 0 || T.kol.ut < 0))) {
    T.transaksjoner = [];
    T.hoppetOver = 0;
    return;
  }
  Object.assign(T, await lagTransaksjoner(T.rader, T.kol, T.konto));
}

/** Viser hvilke kolonner som er brukt, og lar kassereren velge selv hvis banken bruker andre navn. */
function kolonnevalg() {
  const k = T.kol || { overskrift: 0, dato: -1, belop: -1, inn: -1, ut: -1, tekst: [] };
  const overskrifter = T.rader[k.overskrift] || [];
  const navn = (i) => (i >= 0 ? String(overskrifter[i] ?? `Kolonne ${i + 1}`) : "");
  const brukt = [
    `Dato: ${navn(k.dato) || "?"}`,
    k.belop >= 0 ? `Beløp: ${navn(k.belop)}` : `Inn: ${navn(k.inn) || "?"}, Ut: ${navn(k.ut) || "?"}`,
    `Tekst: ${k.tekst.map(navn).join(" + ") || "ingen"}`,
  ].join(" · ");
  const valg = (felt, etikett, valgt) => html`<label>${etikett}<select name="${felt}">
    <option value="-1">(ingen)</option>
    ${overskrifter.map((o, i) => raw(html`<option value="${i}" ${i === valgt ? "selected" : ""}>${o || `Kolonne ${i + 1}`}</option>`))}
  </select></label>`;
  return html`
    <details id="kolonner" ${T.kol ? "" : "open"}>
      <summary class="hint">Kolonner: ${brukt}. Endre</summary>
      <div class="to-kol">
        <label>Overskriftene står på rad<select name="overskrift">
          ${T.rader.slice(0, 20).map((_, i) => raw(html`<option value="${i}" ${i === k.overskrift ? "selected" : ""}>${i + 1}</option>`))}
        </select></label>
        ${raw(valg("dato", "Dato", k.dato))}
        ${raw(valg("belop", "Beløp (minus = ut)", k.belop))}
        ${raw(valg("tekst", "Tekst", k.tekst[0] ?? -1))}
        ${raw(valg("inn", "Inn (hvis ikke Beløp)", k.inn))}
        ${raw(valg("ut", "Ut (hvis ikke Beløp)", k.ut))}
        ${raw(valg("tekst2", "Mer tekst", k.tekst[1] ?? -1))}
      </div>
    </details>`;
}

function rad(t, st, S) {
  const p = st.post;
  const linje = {
    ny: "",
    kanskje: p && html`Trolig ført for hånd: bilag #${p.bilagsnr} ${datoTekst(p.dato)}${p.beskrivelse ? `, ${p.beskrivelse}` : ""}`,
    fort: p && html`Ført som bilag #${p.bilagsnr}${p.kategori ? ` · ${p.kategori}` : ""}`,
    hoppet: "Hoppet over",
    forStart: `Før startdatoen ${datoTekst(S.innst.startDato)}, er med i startsaldoen`,
  }[st.status];
  const knapper = {
    ny: html`<button class="knapp liten sekundaer" data-hopp="ja">Hopp over</button><button class="knapp liten" data-for>Før</button>`,
    kanskje: html`<button class="knapp liten sekundaer" data-for>Før som ny</button><button class="knapp liten" data-koble>Ja, samme</button>`,
    fort: html`<a class="knapp liten sekundaer" href="#/post/${p?.id}">Åpne</a>`,
    hoppet: html`<button class="knapp liten sekundaer" data-hopp="nei">Angre</button>`,
    forStart: "",
  }[st.status];
  return html`
    <li data-id="${t.id}" class="bank-${st.status}">
      <span class="post-dato">${datoTekst(t.dato)}</span>
      <span class="post-tekst">
        <span>${t.tekst || "(uten tekst)"}</span>
        ${linje ? raw(html`<span class="post-kategori">${raw(linje)}</span>`) : ""}
      </span>
      ${raw(fortegn(t.belop))}
      <span class="bank-knapper">${raw(knapper)}</span>
    </li>`;
}

/** Skjema for å føre én transaksjon. «Lagre og neste» åpner neste transaksjon som ikke er ført. */
function forDialog(S, t, nye) {
  const innst = S.innst;
  const ut = t.belop < 0;
  const vanligType = ut ? "utgift" : "inntekt";
  const andreKontoer = innst.kontoer.filter((k) => k.id !== T.konto);
  // Er samme tekst ført før, foreslås samme kategori og beskrivelse.
  const forrige = t.tekst ? [...S.poster].filter((p) => p.bankTekst === t.tekst && p.type === vanligType).sort((a, b) => b.dato.localeCompare(a.dato))[0] : null;
  let type = vanligType;
  const neste = nye.filter((x) => x.id !== t.id);

  const d = dialog(html`
    <form class="skjema">
      <div class="dialog-topp"><h2>Før transaksjon</h2><button type="button" class="ikonknapp" data-lukk aria-label="Lukk">${raw(ikon("lukk"))}</button></div>
      <p class="dialog-tekst">${datoTekst(t.dato)} · ${t.tekst || "(uten tekst)"}<br><strong>${raw(fortegn(t.belop))}</strong>
        ${ut ? "ut fra" : "inn på"} ${kontonavn(T.konto, innst)}</p>
      ${andreKontoer.length ? raw(html`<div class="veksler" role="radiogroup" aria-label="Type">
        <button type="button" data-type="${vanligType}">${ut ? "Utgift" : "Inntekt"}</button>
        <button type="button" data-type="overforing">Overføring</button>
      </div>`) : ""}
      <label data-vis="vanlig">Kategori<select name="kategori" required>
        <option value="">Velg kategori …</option>
        ${innst.kategorier[vanligType].map((k) => raw(html`<option ${k === forrige?.kategori ? "selected" : ""}>${k}</option>`))}
      </select></label>
      <label data-vis="overforing" hidden>${ut ? "Til konto" : "Fra konto"}<select name="annenKonto">
        ${andreKontoer.map((k) => raw(html`<option value="${k.id}">${k.navn}</option>`))}
      </select></label>
      <label>Beskrivelse<input name="beskrivelse" maxlength="200" value="${forrige?.beskrivelse || t.tekst}"></label>
      <fieldset><legend>Kvittering / bilag</legend><div id="kvitteringer"></div></fieldset>
      <div class="knapper">
        <button type="submit" class="knapp ${neste.length ? "sekundaer" : ""}" value="lagre">Lagre</button>
        ${neste.length ? raw(`<button type="submit" class="knapp" value="neste">Lagre og neste</button>`) : ""}
      </div>
    </form>`);

  const skjema = d.querySelector("form");
  const velger = kvitteringsvelger(d.querySelector("#kvitteringer"));
  const tegnType = () => {
    skjema.querySelectorAll("[data-type]").forEach((b) => {
      b.classList.toggle("valgt", b.dataset.type === type);
      b.setAttribute("aria-checked", b.dataset.type === type);
    });
    skjema.querySelector("[data-vis=vanlig]").hidden = type === "overforing";
    skjema.querySelector("[data-vis=overforing]").hidden = type !== "overforing";
    skjema.elements.kategori.required = type !== "overforing";
  };
  skjema.querySelectorAll("[data-type]").forEach((b) => b.addEventListener("click", () => { type = b.dataset.type; tegnType(); }));
  tegnType();

  skjema.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(skjema));
    const belop = Math.abs(t.belop);
    const data = type === "overforing"
      ? { type, dato: t.dato, belop, kategori: "", konto: null, fraKonto: ut ? T.konto : f.annenKonto, tilKonto: ut ? f.annenKonto : T.konto }
      : { type, dato: t.dato, belop, kategori: f.kategori, konto: T.konto, fraKonto: null, tilKonto: null };
    const videre = e.submitter?.value === "neste";
    await medKnapp(e.submitter, async () => {
      const kvitteringIds = await velger.lagreNye();
      await lagrePost(null, { ...data, beskrivelse: f.beskrivelse.trim(), kvitteringIds, bank: { [T.konto]: t.id }, bankTekst: t.tekst });
      melding("Posten er ført.");
      d.close();
      if (videre) forDialog(S, neste[0], neste);
    });
  });
}
