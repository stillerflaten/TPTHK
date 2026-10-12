// Liste over inntekter, utgifter og overføringer, og skjema for å føre en ny post.

import { html, raw, kr, tall, datoTekst, iDag, tolkBelop, belopTilInput, lastNedCsv } from "../util.js";
import { aarFor, sorterPoster, bilagsnrForNy, endring, kontoFor, kontonavn, foeringslinjer } from "../regnskap.js";
import { lagrePost, slettPost, slettKvittering } from "../firebase.js";
import { melding, medKnapp, bekreft, kvitteringsvelger, kvitteringslenker, kobleKvitteringslenker } from "../ui.js";
import { gaaTil } from "../app.js";
import { ikon } from "../ikoner.js";
import { erKasserer } from "../tilgang.js";

// Filteret huskes mens appen er åpen.
const filter = { type: "", kategori: "", konto: "", sok: "" };

const typeTekst = { inntekt: "Inntekt", utgift: "Utgift", overforing: "Overføring" };

/** Kort tekst om hvilken konto posten gjelder. */
export function kontotekst(p, innst) {
  if (p.type === "overforing") return `${kontonavn(p.fraKonto, innst)} → ${kontonavn(p.tilKonto, innst)}`;
  return kontonavn(kontoFor(p, innst), innst);
}

/** Beløp med fortegn og farge. Med konto vises endringen for den kontoen. */
export function belopHtml(p, innst, konto) {
  if (p.type === "overforing" && !konto) return html`<span class="post-belop noytral">${kr(p.belop)}</span>`;
  const e = endring(p, innst, konto);
  return html`<span class="post-belop ${e < 0 ? "minus" : "pluss"}">${e < 0 ? "−" : "+"}${kr(Math.abs(e))}</span>`;
}

/** Posten ført som minus på én konto og pluss på en annen, slik kassereren er vant til fra kontoplanen. */
export function foeringHtml(p, innst) {
  const linjer = foeringslinjer(p, innst);
  return html`<table class="regnskap foering">
    <thead><tr><th>Konto</th><th class="tall">Beløp</th></tr></thead>
    <tbody>${linjer.map((l) => raw(html`
      <tr><td>${l.konto}${l.bank ? raw(` <span class="dempet">(bank)</span>`) : ""}</td>
      <td class="tall ${l.belop < 0 ? "minus" : "pluss"}">${l.belop < 0 ? "−" : "+"}${kr(Math.abs(l.belop))}</td></tr>`))}
      <tr class="sum"><td>Sum</td><td class="tall">${kr(linjer.reduce((s, l) => s + l.belop, 0))}</td></tr>
    </tbody>
  </table>`;
}

export function liste(main, S) {
  const flereKontoer = S.innst.kontoer.length > 1;
  if (!flereKontoer) filter.konto = "";
  const alleIAar = sorterPoster(S.poster.filter((p) => aarFor(p) === S.aar));
  const kategorier = [...new Set(alleIAar.map((p) => p.kategori).filter(Boolean))].sort((a, b) => a.localeCompare(b, "nb"));
  const sok = filter.sok.toLowerCase();
  const synlige = alleIAar.filter((p) =>
    (!filter.type || p.type === filter.type)
    && (!filter.kategori || p.kategori === filter.kategori)
    && (!filter.konto || endring(p, S.innst, filter.konto) !== 0)
    && (!sok || `${p.beskrivelse} ${p.kategori} ${p.bilagsnr} ${tall(p.belop)}`.toLowerCase().includes(sok)));
  const sum = synlige.reduce((s, p) => s + endring(p, S.innst, filter.konto || undefined), 0);

  main.innerHTML = html`
    <div class="sidetopp">
      <h1>Poster ${S.aar}</h1>
      <div class="knapperad">
        <button class="knapp sekundaer" id="eksport">${raw(ikon("lastned"))} Excel</button>
        ${erKasserer(S) ? raw(`<a class="knapp sekundaer" href="#/bankimport">Importer fra bank</a><a class="knapp" href="#/post/ny">+ Ny post</a>`) : ""}
      </div>
    </div>

    <div class="filterlinje ${flereKontoer ? "fire" : ""}">
      <input type="search" id="sok" placeholder="Søk i beskrivelse, beløp, bilagsnr …" value="${filter.sok}">
      <select id="type">
        <option value="">Alle typer</option>
        ${Object.entries(typeTekst).map(([k, t]) => raw(html`<option value="${k}" ${filter.type === k ? "selected" : ""}>${t}er</option>`))}
      </select>
      <select id="kategori">
        <option value="">Alle kategorier</option>
        ${kategorier.map((k) => raw(html`<option ${k === filter.kategori ? "selected" : ""}>${k}</option>`))}
      </select>
      ${flereKontoer ? raw(html`<select id="konto">
        <option value="">Alle kontoer</option>
        ${S.innst.kontoer.map((k) => raw(html`<option value="${k.id}" ${k.id === filter.konto ? "selected" : ""}>${k.navn}</option>`))}
      </select>`) : ""}
    </div>

    ${synlige.length ? raw(html`
      <ul class="postliste">
        ${synlige.map((p) => raw(html`
          <li><a href="#/post/${p.id}">
            <span class="post-dato">${datoTekst(p.dato)}</span>
            <span class="post-bilag">#${p.bilagsnr}</span>
            <span class="post-tekst">
              <span>${p.beskrivelse || p.kategori || typeTekst[p.type]}</span>
              <span class="post-kategori">${[p.kategori, flereKontoer || p.type === "overforing" ? kontotekst(p, S.innst) : ""].filter(Boolean).join(" · ")}${p.kvitteringIds?.length ? " · kvittering" : ""}${p.soknadId ? " · fra søknad" : ""}</span>
            </span>
            ${raw(belopHtml(p, S.innst, filter.konto || undefined))}
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
  for (const felt of ["type", "kategori", "konto"]) {
    main.querySelector(`#${felt}`)?.addEventListener("change", (e) => { filter[felt] = e.target.value; liste(main, S); });
  }
  main.querySelector("#eksport").addEventListener("click", () => eksporter(S, alleIAar));
}
liste.live = true;
liste.tittel = "Poster";
liste.trenger = ["poster", "innst"];

function eksporter(S, poster) {
  const rader = [["Dato", "Bilagsnr", "Type", "Konto", "Kategori", "Beskrivelse", "Inn", "Ut", "Kvittering"]];
  for (const p of [...poster].reverse()) {
    rader.push([
      datoTekst(p.dato), p.bilagsnr, typeTekst[p.type], kontotekst(p, S.innst), p.kategori || "", p.beskrivelse,
      p.type === "inntekt" ? tall(p.belop) : "", p.type === "utgift" ? tall(p.belop) : "",
      p.kvitteringIds?.length ? "Ja" : "",
    ]);
  }
  lastNedCsv(`${S.innst.kortnavn || "TPTHK"}-regnskap-${S.aar}.csv`, rader);
}

/** Nedtrekksliste med klubbens kontoer. */
export function kontovalg(innst, navn, valgt, etikett = "Konto") {
  return html`<label>${etikett}<select name="${navn}" required>
    ${innst.kontoer.map((k) => raw(html`<option value="${k.id}" ${k.id === valgt ? "selected" : ""}>${k.navn}${k.kontonummer ? ` (${k.kontonummer})` : ""}</option>`))}
  </select></label>`;
}

export function skjema(main, S, id) {
  const ny = id === "ny" || !id;
  const p = ny ? null : S.poster.find((x) => x.id === id);
  if (!ny && !p) {
    main.innerHTML = `<div class="tom">Fant ikke posten. Den kan være slettet. <a href="#/poster">Tilbake</a></div>`;
    return;
  }
  const laastType = Boolean(p?.soknadId || p?.kontingentAar);
  const flereKontoer = S.innst.kontoer.length > 1;
  let type = p?.type || "utgift";
  const forsteKonto = S.innst.kontoer[0].id;

  main.innerHTML = html`
    <div class="sidetopp">
      <h1>${ny ? "Ny post" : `Bilag #${p.bilagsnr}`}</h1>
      <a class="lenkeknapp" href="#/poster">Tilbake</a>
    </div>
    ${p?.soknadId ? raw(`<div class="varsel info">Denne posten ble laget fra en refusjonssøknad. <a href="#/soknad/${p.soknadId}">Åpne søknaden</a></div>`) : ""}
    ${p?.kontingentAar ? raw(html`<div class="varsel info">Kontingent ${p.kontingentAar} fra medlemslisten. Slett posten her eller angre betalingen under Medlemmer.</div>`) : ""}

    <form id="skjema" class="skjema kort">
      <div class="veksler tre" role="radiogroup" aria-label="Type">
        <button type="button" data-type="utgift">Utgift</button>
        <button type="button" data-type="inntekt">Inntekt</button>
        ${flereKontoer ? raw(`<button type="button" data-type="overforing">Overføring</button>`) : ""}
      </div>

      <div class="to-kol">
        <label>Dato<input type="date" name="dato" value="${p?.dato || iDag()}" required></label>
        <label>Beløp (kr)<input name="belop" inputmode="decimal" placeholder="0,00" value="${belopTilInput(p?.belop)}" required autocomplete="off"></label>
      </div>
      <p class="hint" id="bilagshint"></p>

      <div data-vis="vanlig" ${flereKontoer ? "" : "hidden"}>${raw(kontovalg(S.innst, "konto", p ? kontoFor(p, S.innst) : forsteKonto))}</div>
      <div data-vis="overforing" class="to-kol">
        ${raw(kontovalg(S.innst, "fraKonto", p?.fraKonto || forsteKonto, "Fra konto"))}
        ${raw(kontovalg(S.innst, "tilKonto", p?.tilKonto || S.innst.kontoer[1]?.id, "Til konto"))}
      </div>
      <label data-vis="vanlig">Kategori
        <select name="kategori" id="kategori"></select>
      </label>
      <div id="foering" aria-live="polite"></div>
      <label>Beskrivelse<input name="beskrivelse" value="${p?.beskrivelse || ""}" placeholder="F.eks. Leie av hall til samling" maxlength="200"></label>

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
  const datoFelt = skjemaEl.elements.dato;
  const velger = kvitteringsvelger(main.querySelector("#kvitteringer"), { eksisterende: p?.kvitteringIds || [], kanFjerne: !p?.soknadId });

  const tegnType = () => {
    skjemaEl.querySelectorAll("[data-type]").forEach((b) => {
      b.classList.toggle("valgt", b.dataset.type === type);
      b.setAttribute("aria-checked", b.dataset.type === type);
    });
    const overforing = type === "overforing";
    skjemaEl.querySelectorAll("[data-vis=overforing]").forEach((el) => { el.hidden = !overforing; });
    skjemaEl.querySelectorAll("[data-vis=vanlig]").forEach((el) => {
      el.hidden = overforing || (el.querySelector("select[name=konto]") && !flereKontoer);
    });
    katSelect.required = !overforing;
    if (overforing) return;
    const valg = [...S.innst.kategorier[type]];
    if (p?.kategori && p.type === type && !valg.includes(p.kategori)) valg.push(p.kategori);
    const forrige = katSelect.value || (p?.type === type ? p.kategori : "");
    katSelect.innerHTML = `<option value="">Velg kategori …</option>` + valg.map((k) => html`<option ${k === forrige ? "selected" : ""}>${k}</option>`).join("");
  };
  // Vis føringen (minus på bankkontoen, pluss på kategorien) mens kassereren fyller ut.
  const visFoering = () => {
    const f = Object.fromEntries(new FormData(skjemaEl));
    const belop = tolkBelop(f.belop);
    const el = main.querySelector("#foering");
    if (!belop || belop <= 0) { el.innerHTML = ""; return; }
    const utkast = type === "overforing"
      ? { type, belop, fraKonto: f.fraKonto, tilKonto: f.tilKonto }
      : { type, belop, kategori: f.kategori, konto: f.konto || forsteKonto };
    el.innerHTML = html`<p class="hint">Slik blir posten ført:</p>${raw(foeringHtml(utkast, S.innst))}`;
  };
  skjemaEl.addEventListener("input", visFoering);
  skjemaEl.addEventListener("change", visFoering);
  skjemaEl.querySelectorAll("[data-type]").forEach((b) => b.addEventListener("click", () => {
    if (laastType) return;
    type = b.dataset.type;
    tegnType();
    visFoering();
  }));
  tegnType();
  visFoering();

  // Bilagsnummeret følger datoen. Vis hva det blir.
  const visBilag = () => {
    if (!datoFelt.value) return;
    const andre = S.poster.filter((x) => x.id !== p?.id);
    const nr = bilagsnrForNy(andre, datoFelt.value);
    const etter = andre.filter((x) => aarFor(x) === aarFor({ dato: datoFelt.value }) && x.dato > datoFelt.value).length;
    main.querySelector("#bilagshint").textContent = ny || datoFelt.value !== p.dato
      ? `Får bilagsnummer ${nr}.${etter ? ` Senere bilag i året flyttes ett nummer opp.` : ""}`
      : "Bilagsnummeret settes automatisk etter dato.";
  };
  datoFelt.addEventListener("change", visBilag);
  visBilag();

  skjemaEl.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(skjemaEl));
    const belop = tolkBelop(f.belop);
    if (!belop || belop <= 0) return melding("Skriv et gyldig beløp, f.eks. 1250 eller 1 250,50.", "feil");
    let data;
    if (type === "overforing") {
      if (f.fraKonto === f.tilKonto) return melding("Velg to forskjellige kontoer.", "feil");
      data = { type, dato: f.dato, belop, fraKonto: f.fraKonto, tilKonto: f.tilKonto, kategori: "", konto: null };
    } else {
      if (!velger.antall() && type === "utgift"
        && !(await bekreft("Utgiften har ingen kvittering. Lagre uten?", { ja: "Lagre uten" }))) return;
      data = { type, dato: f.dato, belop, kategori: f.kategori, konto: f.konto || forsteKonto, fraKonto: null, tilKonto: null };
    }

    await medKnapp(e.submitter, async () => {
      const kvitteringIds = await velger.lagreNye();
      await lagrePost(ny ? null : p.id, { ...data, beskrivelse: f.beskrivelse.trim(), kvitteringIds });
      for (const k of velger.fjernet()) await slettKvittering(k).catch(() => {});
      melding(ny ? "Posten er lagret." : "Endringene er lagret.");
      gaaTil("poster");
    });
  });

  main.querySelector("#slett")?.addEventListener("click", async (e) => {
    const tekst = p.soknadId
      ? "Slette posten? Søknaden går tilbake til «godkjent» og kan utbetales på nytt."
      : "Slette posten og kvitteringene for godt? Senere bilag i året flyttes ett nummer ned.";
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

/** Én post, bare til å lese (for revisor). Viser bilaget med kvitteringer og hvem som har ført det. */
export function visning(main, S, id) {
  const p = S.poster.find((x) => x.id === id);
  if (!p) {
    main.innerHTML = `<div class="tom">Fant ikke posten. Den kan være slettet. <a href="#/poster">Tilbake</a></div>`;
    return;
  }
  const ids = p.kvitteringIds || [];
  main.innerHTML = html`
    <div class="sidetopp">
      <h1>Bilag #${p.bilagsnr}</h1>
      <a class="lenkeknapp" href="#/poster">Tilbake</a>
    </div>
    <section class="kort">
      <dl class="info">
        <dt>Dato</dt><dd>${datoTekst(p.dato)}</dd>
        <dt>Type</dt><dd>${typeTekst[p.type]}${p.soknadId ? " (refusjon etter søknad)" : ""}${p.kontingentAar ? ` (kontingent ${p.kontingentAar})` : ""}</dd>
        <dt>Beløp</dt><dd><strong>${raw(belopHtml(p, S.innst))}</strong></dd>
        <dt>Konto</dt><dd>${kontotekst(p, S.innst)}</dd>
        ${p.type !== "overforing" ? raw(html`<dt>Kategori</dt><dd>${p.kategori || "–"}</dd>`) : ""}
        <dt>Føring</dt><dd>${raw(foeringHtml(p, S.innst))}</dd>
        <dt>Beskrivelse</dt><dd class="fritekst">${p.beskrivelse || "–"}</dd>
        ${p.opprettetAv ? raw(html`<dt>Ført av</dt><dd>${p.opprettetAv}</dd>`) : ""}
        ${p.endretAv && p.endretAv !== p.opprettetAv ? raw(html`<dt>Sist endret av</dt><dd>${p.endretAv}</dd>`) : ""}
      </dl>
      <h2>Kvittering / bilag</h2>
      ${ids.length ? raw(html`<div class="brikker">${raw(kvitteringslenker(ids))}</div>`) : raw(`<p class="hint">Ingen kvittering lagt ved.</p>`)}
    </section>`;
  kobleKvitteringslenker(main);
}
visning.live = true;
visning.tittel = "Bilag";
visning.trenger = ["poster", "innst"];
