// Liste over inntekter og utgifter, og skjema for å føre en ny post.

import { html, raw, kr, tall, datoTekst, iDag, tolkBelop, belopTilInput, lastNedCsv } from "../util.js";
import { aarFor, sorterPoster, nesteBilagsnr } from "../regnskap.js";
import { lagrePost, slettPost, slettKvittering } from "../firebase.js";
import { melding, medKnapp, bekreft, kvitteringsvelger } from "../ui.js";
import { gaaTil } from "../app.js";

// Filteret huskes mens appen er åpen.
const filter = { type: "", kategori: "", sok: "" };

export function liste(main, S) {
  const alleIAar = sorterPoster(S.poster.filter((p) => aarFor(p) === S.aar));
  const kategorier = [...new Set(alleIAar.map((p) => p.kategori).filter(Boolean))].sort((a, b) => a.localeCompare(b, "nb"));
  const sok = filter.sok.toLowerCase();
  const synlige = alleIAar.filter((p) =>
    (!filter.type || p.type === filter.type)
    && (!filter.kategori || p.kategori === filter.kategori)
    && (!sok || `${p.beskrivelse} ${p.kategori} ${p.bilagsnr} ${tall(p.belop)}`.toLowerCase().includes(sok)));
  const sum = synlige.reduce((s, p) => s + (p.type === "utgift" ? -p.belop : p.belop), 0);

  main.innerHTML = html`
    <div class="sidetopp">
      <h1>Poster ${S.aar}</h1>
      <div class="knapperad">
        <button class="knapp sekundaer" id="eksport">⬇︎ Excel</button>
        <a class="knapp" href="#/post/ny">+ Ny post</a>
      </div>
    </div>

    <div class="filterlinje">
      <input type="search" id="sok" placeholder="Søk i beskrivelse, beløp, bilagsnr …" value="${filter.sok}">
      <select id="type">
        <option value="">Alle typer</option>
        <option value="inntekt" ${filter.type === "inntekt" ? "selected" : ""}>Inntekter</option>
        <option value="utgift" ${filter.type === "utgift" ? "selected" : ""}>Utgifter</option>
      </select>
      <select id="kategori">
        <option value="">Alle kategorier</option>
        ${kategorier.map((k) => raw(html`<option ${k === filter.kategori ? "selected" : ""}>${k}</option>`))}
      </select>
    </div>

    ${synlige.length ? raw(html`
      <ul class="postliste">
        ${synlige.map((p) => raw(html`
          <li><a href="#/post/${p.id}">
            <span class="post-bilag">#${p.bilagsnr || "–"}</span>
            <span class="post-dato">${datoTekst(p.dato)}</span>
            <span class="post-tekst">
              <span>${p.beskrivelse || p.kategori}</span>
              <span class="post-kategori">${p.kategori}${p.kvitteringIds?.length ? " · 📎" : ""}${p.soknadId ? " · fra søknad" : ""}</span>
            </span>
            <span class="post-belop ${p.type === "utgift" ? "minus" : "pluss"}">${p.type === "utgift" ? "−" : "+"}${kr(p.belop)}</span>
          </a></li>`))}
      </ul>
      <p class="sumlinje">${synlige.length} poster · Netto ${kr(sum)}</p>`)
      : raw(html`<div class="tom">${alleIAar.length ? "Ingen poster passer filteret." : `Ingen poster i ${S.aar} ennå.`}</div>`)}`;

  const sokefelt = main.querySelector("#sok");
  sokefelt.addEventListener("input", () => {
    filter.sok = sokefelt.value;
    const pos = sokefelt.selectionStart;
    liste(main, S);
    const nytt = main.querySelector("#sok");
    nytt.focus();
    nytt.setSelectionRange(pos, pos);
  });
  main.querySelector("#type").addEventListener("change", (e) => { filter.type = e.target.value; liste(main, S); });
  main.querySelector("#kategori").addEventListener("change", (e) => { filter.kategori = e.target.value; liste(main, S); });
  main.querySelector("#eksport").addEventListener("click", () => eksporter(S, alleIAar));
}
liste.live = true;
liste.tittel = "Poster";
liste.trenger = ["poster", "innst"];

function eksporter(S, poster) {
  const rader = [["Bilagsnr", "Dato", "Type", "Kategori", "Beskrivelse", "Inntekt", "Utgift", "Kvittering"]];
  for (const p of [...poster].reverse()) {
    rader.push([
      p.bilagsnr, datoTekst(p.dato), p.type === "utgift" ? "Utgift" : "Inntekt", p.kategori, p.beskrivelse,
      p.type === "inntekt" ? tall(p.belop) : "", p.type === "utgift" ? tall(p.belop) : "",
      p.kvitteringIds?.length ? "Ja" : "",
    ]);
  }
  lastNedCsv(`${S.innst.kortnavn || "TPTHK"}-regnskap-${S.aar}.csv`, rader);
}

export function skjema(main, S, id) {
  const ny = id === "ny" || !id;
  const p = ny ? null : S.poster.find((x) => x.id === id);
  if (!ny && !p) {
    main.innerHTML = `<div class="tom">Fant ikke posten. Den kan være slettet. <a href="#/poster">Tilbake</a></div>`;
    return;
  }
  const laastType = Boolean(p?.soknadId || p?.kontingentAar);
  let type = p?.type || "utgift";
  const dato = p?.dato || iDag();

  main.innerHTML = html`
    <div class="sidetopp">
      <h1>${ny ? "Ny post" : `Bilag #${p.bilagsnr || "–"}`}</h1>
      <a class="lenkeknapp" href="#/poster">Tilbake</a>
    </div>
    ${p?.soknadId ? raw(`<div class="varsel info">Denne posten ble laget fra en refusjonssøknad. <a href="#/soknad/${p.soknadId}">Åpne søknaden</a></div>`) : ""}
    ${p?.kontingentAar ? raw(html`<div class="varsel info">Kontingent ${p.kontingentAar} fra medlemslisten. Slett posten her eller angre betalingen under Medlemmer.</div>`) : ""}

    <form id="skjema" class="skjema kort">
      <div class="veksler" role="radiogroup" aria-label="Type">
        <button type="button" data-type="utgift">Utgift</button>
        <button type="button" data-type="inntekt">Inntekt</button>
      </div>

      <div class="to-kol">
        <label>Dato<input type="date" name="dato" value="${dato}" required></label>
        <label>Beløp (kr)<input name="belop" inputmode="decimal" placeholder="0,00" value="${belopTilInput(p?.belop)}" required autocomplete="off"></label>
      </div>
      <label>Kategori
        <select name="kategori" id="kategori" required></select>
      </label>
      <label>Beskrivelse<input name="beskrivelse" value="${p?.beskrivelse || ""}" placeholder="F.eks. Leie av hall til samling" maxlength="200"></label>
      <label>Bilagsnummer<input name="bilagsnr" type="number" min="1" value="${p?.bilagsnr || ""}" required></label>
      <p class="hint" id="bilagshint"></p>

      <fieldset>
        <legend>Kvittering / bilag</legend>
        <div id="kvitteringer"></div>
      </fieldset>

      <div class="knapper">
        ${ny ? "" : raw(`<button type="button" class="knapp farlig sekundaer" id="slett">Slett</button>`)}
        <button type="submit" class="knapp">${ny ? "Lagre post" : "Lagre endringer"}</button>
      </div>
      ${p?.endretAv ? raw(html`<p class="hint">Sist endret av ${p.endretAv}</p>`) : ""}
    </form>`;

  const skjemaEl = main.querySelector("#skjema");
  const katSelect = main.querySelector("#kategori");
  const bilag = skjemaEl.elements.bilagsnr;
  const datoFelt = skjemaEl.elements.dato;
  const velger = kvitteringsvelger(main.querySelector("#kvitteringer"), { eksisterende: p?.kvitteringIds || [], kanFjerne: !p?.soknadId });

  const tegnType = () => {
    skjemaEl.querySelectorAll("[data-type]").forEach((b) => {
      b.classList.toggle("valgt", b.dataset.type === type);
      b.setAttribute("aria-checked", b.dataset.type === type);
    });
    const valg = [...S.innst.kategorier[type]];
    if (p?.kategori && p.type === type && !valg.includes(p.kategori)) valg.push(p.kategori);
    const forrige = katSelect.value || (p?.type === type ? p.kategori : "");
    katSelect.innerHTML = `<option value="">Velg kategori …</option>` + valg.map((k) => html`<option ${k === forrige ? "selected" : ""}>${k}</option>`).join("");
  };
  skjemaEl.querySelectorAll("[data-type]").forEach((b) => b.addEventListener("click", () => {
    if (laastType) return;
    type = b.dataset.type;
    tegnType();
  }));
  tegnType();

  // Foreslå neste bilagsnummer for året datoen hører til.
  const foreslaaBilag = () => {
    const aar = Number(datoFelt.value.slice(0, 4));
    if (!aar) return;
    const neste = nesteBilagsnr(S.poster.filter((x) => x.id !== p?.id), aar);
    if (ny) bilag.value = neste;
    main.querySelector("#bilagshint").textContent = `Neste ledige bilagsnummer i ${aar} er ${neste}.`;
  };
  datoFelt.addEventListener("change", foreslaaBilag);
  foreslaaBilag();

  skjemaEl.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(skjemaEl));
    const belop = tolkBelop(f.belop);
    if (!belop || belop <= 0) return melding("Skriv et gyldig beløp, f.eks. 1250 eller 1 250,50.", "feil");
    const bilagsnr = Number(f.bilagsnr);
    const duplikat = S.poster.find((x) => x.id !== p?.id && aarFor(x) === Number(f.dato.slice(0, 4)) && Number(x.bilagsnr) === bilagsnr);
    if (duplikat && !(await bekreft(`Bilagsnummer ${bilagsnr} er allerede brukt i ${f.dato.slice(0, 4)}. Lagre likevel?`))) return;
    if (!velger.antall() && type === "utgift"
      && !(await bekreft("Utgiften har ingen kvittering. Lagre uten?", { ja: "Lagre uten" }))) return;

    await medKnapp(e.submitter, async () => {
      const kvitteringIds = await velger.lagreNye();
      await lagrePost(ny ? null : p.id, {
        type, dato: f.dato, belop, kategori: f.kategori, beskrivelse: f.beskrivelse.trim(), bilagsnr, kvitteringIds,
      });
      for (const k of velger.fjernet()) await slettKvittering(k).catch(() => {});
      melding(ny ? "Posten er lagret." : "Endringene er lagret.");
      gaaTil("poster");
    });
  });

  main.querySelector("#slett")?.addEventListener("click", async (e) => {
    const tekst = p.soknadId
      ? "Slette posten? Søknaden går tilbake til «godkjent» og kan utbetales på nytt."
      : "Slette posten og kvitteringene for godt?";
    if (!(await bekreft(tekst, { ja: "Slett", farlig: true }))) return;
    await medKnapp(e.currentTarget, async () => {
      await slettPost(p);
      melding("Posten er slettet.");
      gaaTil("poster");
    });
  });
}
skjema.tittel = "Post";
skjema.trenger = ["poster", "innst"];
