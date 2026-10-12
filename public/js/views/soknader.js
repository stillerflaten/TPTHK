// Søknader om å få dekket utlegg: medlemmene sender, kassereren behandler og utbetaler.

import { html, raw, kr, datoTekst, iDag, tolkBelop, belopTilInput } from "../util.js";
import { kontovalg } from "./poster.js";
import { sendSoknad, trekkSoknad, behandleSoknad, utbetalSoknad, oppdaterMinProfil } from "../firebase.js";
import { melding, medKnapp, bekreft, kvitteringslenker, kobleKvitteringslenker, kvitteringsvelger } from "../ui.js";
import { gaaTil } from "../app.js";

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

function soknadsinfo(s) {
  return html`
    <dl class="info">
      <dt>Søker</dt><dd>${s.navn} <span class="hint">(${s.epost})</span></dd>
      <dt>Gjelder</dt><dd class="fritekst">${s.formaal}</dd>
      <dt>Dato for utlegg</dt><dd>${datoTekst(s.dato)}</dd>
      <dt>Beløp</dt><dd><strong>${kr(s.belop)}</strong></dd>
      <dt>Kontonummer</dt><dd>${visKonto(s.kontonummer)}</dd>
      <dt>Status</dt><dd>${raw(statusMerke(s))}${s.utbetaltDato ? ` ${datoTekst(s.utbetaltDato)}` : ""}</dd>
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
    <div class="sidetopp"><h1>Søknader om refusjon</h1></div>
    <p class="hint">Medlemmene sender inn utlegg med kvittering fra sin egen side. Her godkjenner du, og fører dem i regnskapet når pengene er betalt ut.</p>
    <div class="faner">
      <button data-fane="venter" class="${fane === "venter" ? "valgt" : ""}">Venter (${venter.length})</button>
      <button data-fane="ferdig" class="${fane === "ferdig" ? "valgt" : ""}">Ferdige (${ferdig.length})</button>
    </div>
    ${vis.length ? raw(soknadsliste(vis, "soknad")) : raw(`<div class="tom">${fane === "venter" ? "Ingen søknader venter. 🎉" : "Ingen ferdigbehandlede søknader ennå."}</div>`)}`;
  main.querySelectorAll("[data-fane]").forEach((b) => b.addEventListener("click", () => { fane = b.dataset.fane; kassererListe(main, S); }));
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
  const kanUtbetales = s.status === "sendt" || s.status === "godkjent";
  main.innerHTML = html`
    <div class="sidetopp"><h1>Søknad fra ${s.navn}</h1><a class="lenkeknapp" href="#/soknader">Tilbake</a></div>
    <section class="kort">${raw(soknadsinfo(s))}</section>

    ${s.status === "utbetalt" && s.postId ? raw(html`<p><a href="#/post/${s.postId}">Åpne posten i regnskapet</a></p>`) : ""}

    ${s.status !== "utbetalt" ? raw(html`
      <section class="kort">
        <h2>Behandle</h2>
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
  const kommentar = () => main.querySelector("#kommentar")?.value.trim() || "";

  main.querySelector("#godkjenn")?.addEventListener("click", (e) => medKnapp(e.currentTarget, async () => {
    await behandleSoknad(s.id, { status: "godkjent", kommentar: kommentar() });
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
        if (kom !== (s.kommentar || "")) await behandleSoknad(s.id, { status: s.status, kommentar: kom });
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
    <div class="sidetopp"><h1>Søknad</h1><a class="lenkeknapp" href="#/mine">Tilbake</a></div>
    <section class="kort">${raw(soknadsinfo(s))}</section>
    ${s.status === "sendt" ? raw(`<div class="knapper venstre"><button class="knapp farlig sekundaer" id="trekk">Trekk søknaden</button></div>`) : ""}`;
  kobleKvitteringslenker(main);
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
      <label>Ditt navn<input name="navn" value="${S.profil.navn || ""}" autocomplete="name" required></label>
      <label>Hva har du lagt ut for?
        <textarea name="formaal" rows="3" required maxlength="500" placeholder="F.eks. Kjøpte premier til klubbmesterskapet"></textarea>
      </label>
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
      <div class="knapper"><button class="knapp" type="submit">Send søknad</button></div>
    </form>`;

  const skjemaEl = main.querySelector("#skjema");
  const velger = kvitteringsvelger(main.querySelector("#kvitteringer"));

  skjemaEl.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(skjemaEl));
    const belop = tolkBelop(f.belop);
    const konto = f.kontonummer.replace(/\D/g, "");
    if (!belop || belop <= 0) return melding("Skriv et gyldig beløp, f.eks. 450 eller 450,50.", "feil");
    if (!gyldigKontonummer(konto)) return melding("Kontonummeret ser ikke riktig ut. Det skal ha 11 siffer.", "feil");
    if (!velger.antall()) return melding("Legg ved minst én kvittering.", "feil");

    await medKnapp(e.submitter, async () => {
      const kvitteringIds = await velger.lagreNye();
      await sendSoknad({
        navn: f.navn.trim(), formaal: f.formaal.trim(), dato: f.dato, belop, kontonummer: konto, kvitteringIds,
      });
      // Husk navn og kontonummer til neste gang.
      if (f.navn.trim() !== S.profil.navn || konto !== S.profil.kontonummer) {
        await oppdaterMinProfil({ navn: f.navn.trim(), kontonummer: konto }).catch(() => {});
      }
      melding("Søknaden er sendt til kassereren.");
      gaaTil("mine");
    });
  });
}
nySoknad.tittel = "Ny søknad";
nySoknad.trenger = ["mineSoknader"];
