// Søknader om å få dekket utlegg: medlemmene sender, kassereren behandler og utbetaler.

import { html, raw, kr, datoTekst, iDag, tolkBelop, belopTilInput, lastNed } from "../util.js";
import { kontovalg } from "./poster.js";
import { sendSoknad, trekkSoknad, behandleSoknad, utbetalSoknad, oppdaterMinProfil, normalEpost, varsleOmSoknad, hentKvittering } from "../firebase.js";
import { melding, medKnapp, bekreft, dialog, kvitteringslenker, kobleKvitteringslenker, kvitteringsvelger } from "../ui.js";
import { aarFor } from "../regnskap.js";
import { gaaTil } from "../app.js";
import { erKasserer } from "../tilgang.js";
import { ikon } from "../ikoner.js";

export const statusTekst = {
  sendt: "Til behandling",
  godkjent: "Godkjent – venter utbetaling",
  avslatt: "Avslått",
  utbetalt: "Utbetalt",
};
const statusMerke = (s) => html`<span class="status status-${s.status}">${statusTekst[s.status] || s.status}</span>`;
const tid = (s) => s.opprettet?.toMillis?.() ?? Date.now();
const nyesteFoerst = (a, b) => tid(b) - tid(a);

/** Norske kontonummer har 11 siffer og et kontrollsiffer (modulus 11). */
export function gyldigKontonummer(nr) {
  const s = String(nr).replace(/\D/g, "");
  if (s.length !== 11) return false;
  const vekter = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = vekter.reduce((t, v, i) => t + v * Number(s[i]), 0);
  const kontroll = (11 - (sum % 11)) % 11;
  return kontroll !== 10 && kontroll === Number(s[10]);
}
const visKonto = (nr) => String(nr || "").replace(/\D/g, "").replace(/^(\d{4})(\d{2})(\d{5})$/, "$1.$2.$3");

// ---------- Utskrift ----------

/** Bilagsnummeret («12/2026») til posten en utbetalt søknad ble ført som, hvis regnskapet er lastet. */
function bilagsoppslag(S) {
  const poster = new Map((S.poster || []).map((p) => [p.id, p]));
  const bilag = (s) => {
    const p = s.postId && poster.get(s.postId);
    return p?.bilagsnr ? { aar: aarFor(p), nr: p.bilagsnr } : null;
  };
  return { tekst: (s) => { const b = bilag(s); return b ? `${b.nr}/${b.aar}` : ""; }, bilag };
}

async function skrivUt(S, soknader, periode) {
  const { lagSoknaderPdf } = await import("../soknadPdf.js");
  const oppslag = bilagsoppslag(S);
  const { blob, filnavn } = await lagSoknaderPdf(soknader, {
    klubbnavn: S.innst?.klubbnavn || S.info?.klubbnavn || "Trøndelag Politis Tjenestehundklubb", statusTekst, bilag: oppslag.tekst, periode, hent: hentKvittering,
  });
  lastNed(filnavn, blob);
}

const UTVALG = {
  utbetalt: { tekst: "Bare utbetalte", passer: (s) => s.status === "utbetalt" },
  aktive: { tekst: "Alle unntatt avslåtte", passer: (s) => s.status !== "avslatt" },
  alle: { tekst: "Alle", passer: () => true },
};

/** Dialog for samle-PDF: velg periode og hvilke søknader, så lages én PDF med oversikt og alle kvitteringene. */
function skrivUtPeriode(S) {
  const aar = S.aar || new Date().getFullYear();
  const d = dialog(html`
    <div class="dialog-topp"><h2>Skriv ut søknader</h2><button class="ikonknapp" data-lukk aria-label="Lukk">${raw(ikon("lukk"))}</button></div>
    <p class="hint">Lager én PDF med alle søknadene i perioden, klar til å skrive ut og sette i perm. Først kommer en oversikt, så får hver søknad sin egen side med kvitteringene bak.</p>
    <form class="skjema" id="utskrift">
      <div class="to-kol">
        <label>Fra og med<input type="date" name="fra" value="${aar}-01-01" required></label>
        <label>Til og med<input type="date" name="til" value="${aar}-12-31" required></label>
      </div>
      <label>Hvilke søknader
        <select name="utvalg">${Object.entries(UTVALG).map(([k, v]) => raw(html`<option value="${k}">${v.tekst}</option>`))}</select>
      </label>
      <p class="hint">Utbetalte søknader regnes etter datoen de ble betalt ut, de andre etter datoen for utlegget.</p>
      <div class="knapper">
        <button type="button" class="knapp sekundaer" data-lukk>Avbryt</button>
        <button class="knapp" type="submit">Lag PDF</button>
      </div>
    </form>`, { bred: true });
  const skjema = d.querySelector("#utskrift");
  skjema.addEventListener("submit", async (e) => {
    e.preventDefault();
    const { fra, til, utvalg } = Object.fromEntries(new FormData(skjema));
    if (fra > til) return melding("Fra-datoen må være før til-datoen.", "feil");
    const { bilag } = bilagsoppslag(S);
    const dato = (s) => s.utbetaltDato || s.dato || "";
    const valgte = S.soknader
      .filter((s) => UTVALG[utvalg].passer(s) && dato(s) >= fra && dato(s) <= til)
      .sort((a, b) => dato(a).localeCompare(dato(b)) || (bilag(a)?.nr || 0) - (bilag(b)?.nr || 0) || tid(a) - tid(b));
    if (!valgte.length) return melding("Ingen søknader passer med det du har valgt.", "feil");
    await medKnapp(e.submitter, async () => {
      await skrivUt(S, valgte, { fra, til, utvalg: UTVALG[utvalg].tekst });
      d.close();
      melding(`PDF-en med ${valgte.length} ${valgte.length === 1 ? "søknad" : "søknader"} er lastet ned. Åpne den og skriv ut.`);
    });
  });
}

function soknadsliste(liste, lenke) {
  return html`<ul class="postliste">${liste.map((s) => raw(html`
    <li><a href="#/${lenke}/${s.id}">
      <span class="post-dato">${datoTekst(s.dato)}</span>
      <span class="post-tekst">
        <span>${s.formaal}</span>
        <span class="post-kategori">${s.navn} · ${raw(statusMerke(s))}</span>
      </span>
      <span class="post-belop">${kr(s.belop)}</span>
    </a></li>`))}</ul>`;
}

/** Knapp som kopierer en verdi, slik at kassereren kan lime den rett inn i nettbanken. */
const kopierknapp = (verdi, hva) => verdi ? html`<button type="button" class="ikonknapp kopierknapp" data-kopier="${verdi}" aria-label="Kopier ${hva}" title="Kopier ${hva}">${raw(ikon("kopier"))}<span class="kopiert" hidden>Kopiert</span></button>` : "";

function kobleKopierknapper(rot) {
  rot.querySelectorAll("[data-kopier]").forEach((b) => b.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(b.dataset.kopier);
    } catch {
      return melding("Klarte ikke å kopiere. Merk teksten og kopier den selv.", "feil");
    }
    const merke = b.querySelector(".kopiert");
    merke.hidden = false;
    b.classList.add("ok");
    clearTimeout(b._tid);
    b._tid = setTimeout(() => { merke.hidden = true; b.classList.remove("ok"); }, 1800);
  }));
}

function soknadsinfo(s, { kopier = false } = {}) {
  return html`
    <dl class="info">
      <dt>Søker</dt><dd>${s.navn} <span class="hint">(${s.epost})</span></dd>
      <dt>Gjelder</dt><dd class="fritekst">${s.formaal}</dd>
      ${s.linjer?.length ? raw(html`<dt>Spesifisering</dt><dd>${raw(s.linjer.map((l) => html`${l.tekst}: ${kr(l.belop)}`).join("<br>"))}</dd>`) : ""}
      <dt>Dato for utlegg</dt><dd>${datoTekst(s.dato)}</dd>
      <dt>Beløp</dt><dd><strong>${kr(s.belop)}</strong>${kopier ? raw(kopierknapp(belopTilInput(s.belop), "beløpet")) : ""}</dd>
      <dt>Kontonummer</dt><dd>${visKonto(s.kontonummer)}${kopier ? raw(kopierknapp(String(s.kontonummer || "").replace(/\D/g, ""), "kontonummeret")) : ""}</dd>
      <dt>Status</dt><dd>${raw(statusMerke(s))}${s.utbetaltDato ? ` ${datoTekst(s.utbetaltDato)}` : ""}</dd>
      ${s.godkjentAv ? raw(html`<dt>Godkjent</dt><dd>${datoTekst(s.godkjentDato)} av ${s.godkjentAv}</dd>`) : ""}
      ${s.vedtak ? raw(html`<dt>Vedtak</dt><dd>${s.vedtak}</dd>`) : ""}
      ${s.kommentar ? raw(html`<dt>Kommentar fra kasserer</dt><dd class="fritekst">${s.kommentar}</dd>`) : ""}
    </dl>
    <div class="brikker">${raw(kvitteringslenker(s.kvitteringIds))}</div>`;
}

// ---------- Kassereren ----------

let fane = "venter";

export function kassererListe(main, S) {
  const venter = S.soknader.filter((s) => s.status === "sendt" || s.status === "godkjent").sort(nyesteFoerst);
  const ferdig = S.soknader.filter((s) => s.status === "utbetalt" || s.status === "avslatt").sort(nyesteFoerst);
  const vis = fane === "venter" ? venter : ferdig;
  main.innerHTML = html`
    <div class="sidetopp">
      <h1>Søknader om refusjon</h1>
      <div class="knapperad">
        ${S.soknader.length ? raw(`<button class="knapp sekundaer" id="skrivUtPeriode">${ikon("skriver")} Skriv ut</button>`) : ""}
        ${erKasserer(S) ? raw(`<a class="knapp sekundaer" href="#/mine">Mine søknader</a><a class="knapp" href="#/ny-soknad">+ Ny søknad</a>`) : ""}
      </div>
    </div>
    <p class="hint">${erKasserer(S) ? "Medlemmene sender inn utlegg med kvittering fra sin egen side. Her godkjenner du, og fører dem i regnskapet når pengene er betalt ut."
      : "Søknadene medlemmene har sendt inn. Kassereren behandler og betaler dem ut. Som styremedlem kan du lese dem og se kvitteringene."}</p>
    <div class="faner">
      <button data-fane="venter" class="${fane === "venter" ? "valgt" : ""}">Venter (${venter.length})</button>
      <button data-fane="ferdig" class="${fane === "ferdig" ? "valgt" : ""}">Ferdige (${ferdig.length})</button>
    </div>
    ${vis.length ? raw(soknadsliste(vis, "soknad")) : raw(`<div class="tom">${fane === "venter" ? "Ingen søknader venter." : "Ingen ferdigbehandlede søknader ennå."}</div>`)}`;
  main.querySelectorAll("[data-fane]").forEach((b) => b.addEventListener("click", () => { fane = b.dataset.fane; kassererListe(main, S); }));
  main.querySelector("#skrivUtPeriode")?.addEventListener("click", () => skrivUtPeriode(S));
}
kassererListe.live = true;
kassererListe.tittel = "Søknader";
kassererListe.trenger = ["soknader"];

export function kassererDetalj(main, S, id) {
  const s = S.soknader.find((x) => x.id === id);
  if (!s) {
    main.innerHTML = `<div class="tom">Fant ikke søknaden. <a href="#/soknader">Tilbake</a></div>`;
    return;
  }
  const kasserer = erKasserer(S);
  const kanUtbetales = kasserer && (s.status === "sendt" || s.status === "godkjent");
  main.innerHTML = html`
    <div class="sidetopp"><h1>Søknad fra ${s.navn}</h1>
      <div class="knapperad"><button class="knapp sekundaer" id="skrivUt">${raw(ikon("skriver"))} Skriv ut</button><a class="lenkeknapp" href="#/soknader">Tilbake</a></div>
    </div>
    ${kasserer && kanUtbetales && s.epost === normalEpost(S.bruker.email) ? raw(`<div class="varsel info">Dette er din egen søknad. Det er lurt at leder eller et annet styremedlem ser over den før du betaler ut.</div>`) : ""}
    <section class="kort">${raw(soknadsinfo(s, { kopier: kasserer }))}</section>

    ${kasserer && s.status === "utbetalt" && s.postId ? raw(html`<p><a href="#/post/${s.postId}">Åpne posten i regnskapet</a></p>`) : ""}

    ${kasserer && s.status !== "utbetalt" ? raw(html`
      <section class="kort">
        <h2>Behandle</h2>
        <label>Vedtak utbetalingen bygger på (valgfritt)
          <input id="vedtak" list="vedtaksliste" maxlength="200" value="${s.vedtak || ""}" placeholder="F.eks. Årsmøtet 2026, sak 5, eller Styrevedtak 12.03.2026">
        </label>
        <datalist id="vedtaksliste">${[...new Set(S.soknader.map((x) => x.vedtak).filter(Boolean))].map((v) => raw(html`<option value="${v}">`))}</datalist>
        <p class="hint">Vedtaket, navnet ditt og datoen kommer med på regningen når du skriver den ut.</p>
        <label>Kommentar til søkeren (valgfritt, men påkrevd ved avslag)
          <textarea id="kommentar" rows="2">${s.kommentar || ""}</textarea>
        </label>
        <div class="knapper venstre">
          ${s.status === "sendt" ? raw(`<button class="knapp sekundaer" id="godkjenn">Godkjenn</button>`) : ""}
          ${s.status === "sendt" || s.status === "godkjent" ? raw(`<button class="knapp farlig sekundaer" id="avslaa">Avslå</button>`) : ""}
          ${s.status === "avslatt" ? raw(`<button class="knapp sekundaer" id="gjenaapne">Gjenåpne</button>`) : ""}
          <button class="knapp farlig sekundaer" id="slettSoknad">Slett søknad</button>
        </div>
      </section>`) : ""}

    ${kanUtbetales ? raw(html`
      <section class="kort">
        <h2>Betalt ut? Før det i regnskapet</h2>
        <p class="hint">Når du har overført pengene i nettbanken, fyll inn her. Da blir det en utgift i regnskapet med kvitteringene vedlagt.</p>
        <form id="utbetal" class="skjema">
          <div class="to-kol">
            <label>Utbetalt dato<input type="date" name="dato" value="${iDag()}" required></label>
            <label>Beløp (kr)<input name="belop" inputmode="decimal" value="${belopTilInput(s.belop)}" required></label>
          </div>
          <label>Kategori
            <select name="kategori" required>
              <option value="">Velg kategori …</option>
              ${S.innst.kategorier.utgift.map((k) => raw(html`<option>${k}</option>`))}
            </select>
          </label>
          <label>Beskrivelse<input name="beskrivelse" value="${`Refusjon ${s.navn}: ${s.formaal}`.slice(0, 200)}" maxlength="200"></label>
          ${S.innst.kontoer.length > 1 ? raw(kontovalg(S.innst, "konto", S.innst.kontoer[0].id, "Betalt fra konto")) : ""}
          <div class="knapper"><button class="knapp" type="submit">Marker som utbetalt</button></div>
        </form>
      </section>`) : ""}`;

  kobleKvitteringslenker(main);
  kobleKopierknapper(main);
  main.querySelector("#skrivUt").addEventListener("click", (e) => medKnapp(e.currentTarget, () => skrivUt(S, [s])));
  const kommentar = () => main.querySelector("#kommentar")?.value.trim() || "";
  const vedtak = () => main.querySelector("#vedtak")?.value.trim() || "";
  // Attestasjonen: hvem som godkjente og når. Settes første gang, også om søknaden betales ut uten å godkjennes først.
  const attest = () => (s.godkjentAv ? {} : { godkjentAv: S.profil.navn || S.bruker.email, godkjentDato: iDag() });

  main.querySelector("#godkjenn")?.addEventListener("click", (e) => medKnapp(e.currentTarget, async () => {
    await behandleSoknad(s.id, { status: "godkjent", kommentar: kommentar(), vedtak: vedtak(), ...attest() });
    melding("Søknaden er godkjent.");
  }));
  main.querySelector("#avslaa")?.addEventListener("click", async (e) => {
    if (!kommentar()) return melding("Skriv en kort begrunnelse til søkeren først.", "feil");
    if (!(await bekreft("Avslå søknaden?", { ja: "Avslå", farlig: true }))) return;
    await medKnapp(e.currentTarget, async () => {
      await behandleSoknad(s.id, { status: "avslatt", kommentar: kommentar() });
      melding("Søknaden er avslått.");
      gaaTil("soknader");
    });
  });
  main.querySelector("#slettSoknad")?.addEventListener("click", async (e) => {
    if (!(await bekreft("Slette søknaden og kvitteringene for godt? Bruk dette for testsøknader eller feil.", { ja: "Slett", farlig: true }))) return;
    await medKnapp(e.currentTarget, async () => {
      await trekkSoknad(s);
      melding("Søknaden er slettet.");
      gaaTil("soknader");
    });
  });
  main.querySelector("#gjenaapne")?.addEventListener("click", (e) => medKnapp(e.currentTarget, async () => {
    await behandleSoknad(s.id, { status: "sendt" });
    melding("Søknaden er åpnet igjen.");
  }));

  const utbetal = main.querySelector("#utbetal");
  if (utbetal) {
    utbetal.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(utbetal));
      const belop = tolkBelop(f.belop);
      if (!belop || belop <= 0) return melding("Skriv et gyldig beløp.", "feil");
      await medKnapp(e.submitter, async () => {
        const kom = kommentar();
        await behandleSoknad(s.id, { status: s.status, kommentar: kom, vedtak: vedtak(), ...attest() });
        await utbetalSoknad(s, {
          type: "utgift", dato: f.dato, belop, kategori: f.kategori,
          beskrivelse: f.beskrivelse.trim(), konto: f.konto || S.innst.kontoer[0].id,
        });
        melding("Utbetalingen er ført i regnskapet.");
        gaaTil("soknader");
      });
    });
  }
}
kassererDetalj.live = true;
kassererDetalj.tittel = "Søknad";
kassererDetalj.trenger = ["soknader", "poster", "innst"];

// ---------- Medlemmet ----------

export function mineListe(main, S) {
  const mine = [...(S.mineSoknader || [])].sort(nyesteFoerst);
  main.innerHTML = html`
    <div class="sidetopp">
      <h1>Mine søknader</h1>
      <a class="knapp" href="#/ny-soknad">+ Ny søknad</a>
    </div>
    <p class="hint">Har du lagt ut penger for klubben? Send en søknad med kvittering, så får du pengene tilbake når kassereren har godkjent den.</p>
    ${mine.length ? raw(soknadsliste(mine, "min-soknad")) : raw(`<div class="tom">Du har ikke sendt noen søknader ennå.</div>`)}`;
}
mineListe.live = true;
mineListe.tittel = "Mine søknader";
mineListe.trenger = ["mineSoknader"];

export function minDetalj(main, S, id) {
  const s = (S.mineSoknader || []).find((x) => x.id === id);
  if (!s) {
    main.innerHTML = `<div class="tom">Fant ikke søknaden. <a href="#/mine">Tilbake</a></div>`;
    return;
  }
  main.innerHTML = html`
    <div class="sidetopp"><h1>Søknad</h1>
      <div class="knapperad"><button class="knapp sekundaer" id="skrivUt">${raw(ikon("skriver"))} Skriv ut regning</button><a class="lenkeknapp" href="#/mine">Tilbake</a></div>
    </div>
    <div class="varsel info">Revisorene krever signatur. Trykk «Skriv ut regning», skriv den ut, signer med penn og gi den til kassereren, eller send et bilde eller en skann av den.</div>
    <section class="kort">${raw(soknadsinfo(s))}</section>
    ${s.status === "sendt" ? raw(`<div class="knapper venstre"><button class="knapp farlig sekundaer" id="trekk">Trekk søknaden</button></div>`) : ""}`;
  kobleKvitteringslenker(main);
  main.querySelector("#skrivUt").addEventListener("click", (e) => medKnapp(e.currentTarget, () => skrivUt(S, [s])));
  main.querySelector("#trekk")?.addEventListener("click", async (e) => {
    if (!(await bekreft("Trekke søknaden? Den og kvitteringene slettes.", { ja: "Trekk", farlig: true }))) return;
    await medKnapp(e.currentTarget, async () => {
      await trekkSoknad(s);
      melding("Søknaden er trukket.");
      gaaTil("mine");
    });
  });
}
minDetalj.live = true;
minDetalj.tittel = "Søknad";
minDetalj.trenger = ["mineSoknader"];

export function nySoknad(main, S) {
  main.innerHTML = html`
    <div class="sidetopp"><h1>Ny søknad om refusjon</h1><a class="lenkeknapp" href="#/mine">Avbryt</a></div>
    <form id="skjema" class="skjema kort">
      <label>Ditt navn<input name="navn" value="${S.profil.navn || ""}" autocomplete="name" required maxlength="100"></label>
      <label>Hva har du lagt ut for?
        <textarea name="formaal" rows="3" required maxlength="500" placeholder="F.eks. Kjøpte premier til klubbmesterskapet"></textarea>
      </label>
      <fieldset>
        <legend>Spesifisering (valgfritt)</legend>
        <p class="hint">Består utlegget av flere ting, for eksempel fly, hotell og kostpenger? Før dem opp hver for seg, så regnes summen ut for deg.</p>
        <div id="linjer"></div>
        <button type="button" class="knapp sekundaer" id="nyLinje">+ Legg til linje</button>
      </fieldset>
      <div class="to-kol">
        <label>Dato for utlegget<input type="date" name="dato" value="${iDag()}" max="${iDag()}" required></label>
        <label>Beløp (kr)<input name="belop" inputmode="decimal" placeholder="0,00" required autocomplete="off"></label>
      </div>
      <label>Kontonummer for utbetaling
        <input name="kontonummer" inputmode="numeric" placeholder="1234.56.78901" value="${visKonto(S.profil.kontonummer)}" required>
      </label>
      <fieldset>
        <legend>Kvitteringer</legend>
        <div id="kvitteringer"></div>
      </fieldset>
      <label class="avkryss lang"><input type="checkbox" name="bekreftet" required>
        Jeg bekrefter at opplysningene stemmer, og at utlegget ikke er dekket på annen måte.</label>
      <div class="knapper"><button class="knapp" type="submit">Send søknad</button></div>
    </form>`;

  const skjemaEl = main.querySelector("#skjema");
  const velger = kvitteringsvelger(main.querySelector("#kvitteringer"));

  // Linjene i spesifiseringen. Når det finnes linjer med beløp, er beløpsfeltet summen av dem.
  const linjeboks = main.querySelector("#linjer");
  const belopFelt = skjemaEl.elements.belop;
  const lesLinjer = () => [...linjeboks.querySelectorAll(".spes-linje")].map((r) => ({
    tekst: r.querySelector("[data-tekst]").value.trim(), belop: tolkBelop(r.querySelector("[data-belop]").value),
  })).filter((l) => l.tekst || l.belop);
  const oppdaterSum = () => {
    const linjer = lesLinjer();
    belopFelt.readOnly = linjer.length > 0;
    if (linjer.length) belopFelt.value = belopTilInput(linjer.reduce((t, l) => t + (l.belop || 0), 0));
  };
  main.querySelector("#nyLinje").addEventListener("click", () => {
    if (linjeboks.children.length >= 20) return melding("Du kan ha opptil 20 linjer.", "feil");
    const rad = document.createElement("div");
    rad.className = "spes-linje";
    rad.innerHTML = html`
      <input data-tekst maxlength="100" placeholder="F.eks. Fly tur-retur Værnes–Alta" aria-label="Hva">
      <input data-belop inputmode="decimal" placeholder="0,00" autocomplete="off" aria-label="Beløp">
      <button type="button" class="ikonknapp" aria-label="Fjern linjen">${raw(ikon("lukk"))}</button>`;
    rad.querySelector("button").addEventListener("click", () => { rad.remove(); oppdaterSum(); });
    rad.addEventListener("input", oppdaterSum);
    linjeboks.append(rad);
    rad.querySelector("input").focus();
  });

  skjemaEl.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(skjemaEl));
    const belop = tolkBelop(f.belop);
    const konto = f.kontonummer.replace(/\D/g, "");
    if (!belop || belop <= 0) return melding("Skriv et gyldig beløp, f.eks. 450 eller 450,50.", "feil");
    if (konto.length !== 11) return melding(`Kontonummeret skal ha 11 siffer, du har skrevet ${konto.length}.`, "feil");
    if (!gyldigKontonummer(konto)) return melding("Kontonummeret finnes ikke (kontrollsifferet stemmer ikke). Sjekk at du har skrevet riktig.", "feil");
    if (!velger.antall()) return melding("Legg ved minst én kvittering.", "feil");
    const linjer = lesLinjer();
    if (linjer.some((l) => !l.tekst || !l.belop || l.belop <= 0)) return melding("Hver linje i spesifiseringen trenger både tekst og beløp.", "feil");

    await medKnapp(e.submitter, async () => {
      const kvitteringIds = await velger.lagreNye();
      await sendSoknad({
        navn: f.navn.trim(), formaal: f.formaal.trim(), dato: f.dato, belop, kontonummer: konto, kvitteringIds,
        ...(linjer.length ? { linjer } : {}), bekreftet: true,
      });
      // E-post til kassereren, hvis det er valgt under Innstillinger. Søknaden er sendt uansett om varselet feiler.
      const til = S.info.varselEpost;
      if (til && til !== normalEpost(S.bruker.email)) await varsleOmSoknad(til).catch(() => {});
      // Husk navn og kontonummer til neste gang.
      if (f.navn.trim() !== S.profil.navn || konto !== S.profil.kontonummer) {
        await oppdaterMinProfil({ navn: f.navn.trim(), kontonummer: konto }).catch(() => {});
      }
      melding("Søknaden er sendt. Husk å skrive ut regningen og signere den.");
      gaaTil("mine");
    });
  });
}
nySoknad.tittel = "Ny søknad";
nySoknad.trenger = ["mineSoknader"];
