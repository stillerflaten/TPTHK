// Regelverk: vedtekter, statutter og andre regler for klubben, samlet ett sted.
// Alle med innlogging kan lese. Styret (og kasserere) legger inn, endrer og fjerner dokumenter.
// Et dokument er enten en PDF (lagret i databasen) eller en lenke til en annen nettside.

import { html, raw, datoTekst, lesSomDataUrl, dataUrlTilBlob, lastNed } from "../util.js";
import { lagreRegel, slettRegel, hentRegelfil } from "../firebase.js";
import { melding, medKnapp, bekreft, feilmelding } from "../ui.js";
import { gaaTil } from "../app.js";
import { ikon } from "../ikoner.js";
import { erStyret } from "../tilgang.js";

export const KATEGORIER = [
  ["vedtekter", "Vedtekter og statutter"],
  ["retningslinjer", "Retningslinjer"],
  ["vedtak", "Vedtak"],
  ["annet", "Annet"],
];
const kategoriNavn = Object.fromEntries(KATEGORIER);

const MAKS_MB = 5;
const erLenke = (s) => /^https?:\/\/\S+$/i.test(String(s || ""));
const storrelse = (b) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toLocaleString("nb-NO", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(b / 1024))} kB`);
const vert = (lenke) => { try { return new URL(lenke).hostname.replace(/^www\./, ""); } catch { return ""; } };
const sortert = (liste) => [...liste].sort((a, b) => String(a.tittel).localeCompare(String(b.tittel), "nb"));

// ---------- Liste ----------

export function liste(main, S) {
  const styret = erStyret(S);
  const grupper = KATEGORIER.map(([id, navn]) => [navn, sortert(S.regelverk.filter((r) => (kategoriNavn[r.kategori] ? r.kategori : "annet") === id))])
    .filter(([, l]) => l.length);

  main.innerHTML = html`
    <div class="sidetopp">
      <h1>Regelverk</h1>
      ${styret ? raw(`<a class="knapp" href="#/regel-skjema/ny">+ Legg til dokument</a>`) : ""}
    </div>
    <p class="hint">Klubbens vedtekter og andre regler som gjelder for medlemmene.${styret ? " Styret legger inn og holder dem oppdatert." : ""}</p>

    ${grupper.length ? raw(grupper.map(([navn, l]) => html`
      <h2 class="regel-gruppe">${navn}</h2>
      <ul class="postliste regelliste">${l.map((r) => raw(html`
        <li>
          <span class="regel-ikon">${raw(ikon(r.fil ? "rapport" : "send"))}</span>
          <span class="post-tekst">
            <span>${r.tittel}</span>
            ${r.beskrivelse ? raw(html`<span class="regel-beskrivelse">${r.beskrivelse}</span>`) : ""}
            <span class="post-kategori">${[
              r.dato ? `Gjelder fra ${datoTekst(r.dato)}` : "",
              r.fil ? `PDF, ${storrelse(r.fil.storrelse || 0)}` : erLenke(r.lenke) ? vert(r.lenke) : "",
            ].filter(Boolean).join(" · ")}</span>
          </span>
          <span class="knapperad">
            ${r.fil ? raw(html`<button class="knapp sekundaer liten" data-apne="${r.id}">Åpne</button>`)
              : erLenke(r.lenke) ? raw(html`<button class="knapp sekundaer liten" data-lenke="${r.id}">Åpne</button>`) : ""}
            ${styret ? raw(html`<button class="lenkeknapp" data-endre="${r.id}">Endre</button>`) : ""}
          </span>
        </li>`))}</ul>`).join(""))
    : raw(`<div class="tom">${styret ? "Ingen dokumenter er lagt inn ennå. Trykk «+ Legg til dokument» for å legge inn vedtektene." : "Styret har ikke lagt inn noe regelverk ennå."}</div>`)}`;

  main.querySelectorAll("[data-apne]").forEach((b) => b.addEventListener("click", () => {
    const r = S.regelverk.find((x) => x.id === b.dataset.apne);
    if (r) medKnapp(b, () => apne(r));
  }));
  // Knapper i stedet for lenker, så de ikke arver utseendet til radene i listen.
  main.querySelectorAll("[data-lenke]").forEach((b) => b.addEventListener("click", () => {
    const r = S.regelverk.find((x) => x.id === b.dataset.lenke);
    if (r && erLenke(r.lenke)) window.open(r.lenke, "_blank", "noopener,noreferrer");
  }));
  main.querySelectorAll("[data-endre]").forEach((b) => b.addEventListener("click", () => gaaTil(`regel-skjema/${b.dataset.endre}`)));
}
liste.live = true;
liste.tittel = "Regelverk";
liste.trenger = ["regelverk"];

/** Åpner PDF-en i ny fane. Blokkerer nettleseren det, lastes den ned i stedet. */
async function apne(r) {
  const b64 = await hentRegelfil(r.fil);
  const blob = dataUrlTilBlob(`data:application/pdf;base64,${b64}`);
  const url = URL.createObjectURL(blob);
  const vindu = window.open(url, "_blank");
  if (!vindu) lastNed(r.fil.navn || `${r.tittel}.pdf`, blob);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// ---------- Legg til og endre (styret) ----------

export function skjema(main, S, id) {
  if (!erStyret(S)) return gaaTil("regelverk");
  const ny = id === "ny";
  const r = ny ? { kategori: "vedtekter" } : S.regelverk.find((x) => x.id === id);
  if (!r) {
    main.innerHTML = `<div class="tom">Fant ikke dokumentet. <a href="#/regelverk">Tilbake</a></div>`;
    return;
  }
  let type = r.lenke ? "lenke" : "pdf";
  let pdf = null;

  main.innerHTML = html`
    <div class="sidetopp"><h1>${ny ? "Legg til dokument" : "Endre dokument"}</h1><a class="lenkeknapp" href="#/regelverk">Avbryt</a></div>
    <form id="skjema" class="skjema kort">
      <label>Kategori<select name="kategori">${KATEGORIER.map(([k, navn]) => raw(html`<option value="${k}" ${r.kategori === k ? "selected" : ""}>${navn}</option>`))}</select></label>
      <label>Tittel<input name="tittel" value="${r.tittel || ""}" maxlength="200" required placeholder="F.eks. Vedtekter for TPTHK"></label>
      <label>Kort beskrivelse (valgfritt)<textarea name="beskrivelse" rows="2" maxlength="500" placeholder="F.eks. Vedtatt på årsmøtet 2026">${r.beskrivelse || ""}</textarea></label>
      <label>Gjelder fra (valgfritt)<input type="date" name="dato" value="${r.dato || ""}"></label>

      <div class="veksler">
        <button type="button" data-type="pdf" class="${type === "pdf" ? "valgt" : ""}">PDF-fil</button>
        <button type="button" data-type="lenke" class="${type === "lenke" ? "valgt" : ""}">Lenke</button>
      </div>
      <div id="pdfFelt" ${type === "pdf" ? "" : "hidden"}>
        <p id="filInfo" class="hint">${r.fil ? `Lagret fil: ${r.fil.navn} (${storrelse(r.fil.storrelse || 0)}). Velg en ny fil hvis du vil bytte den ut.` : `Velg en PDF på maks ${MAKS_MB} MB.`}</p>
        <label class="knapp sekundaer filknapp">${raw(ikon("binders"))} ${r.fil ? "Bytt fil" : "Velg PDF"}
          <input type="file" id="fil" accept="application/pdf,.pdf" hidden></label>
      </div>
      <div id="lenkeFelt" ${type === "lenke" ? "" : "hidden"}>
        <label>Adresse<input name="lenke" type="url" value="${r.lenke || ""}" placeholder="https://"></label>
        <p class="hint">For regler som ligger på en annen nettside, f.eks. hos Norsk politihundelag.</p>
      </div>
      <p class="hint">Alle med innlogging kan lese dokumentet så snart det er lagret.</p>
      <div class="knapper">
        ${ny ? "" : raw(`<button type="button" class="knapp farlig sekundaer" id="slett">Slett</button>`)}
        <button type="submit" class="knapp">${ny ? "Legg til" : "Lagre"}</button>
      </div>
    </form>`;

  const f = main.querySelector("#skjema");
  main.querySelectorAll("[data-type]").forEach((b) => b.addEventListener("click", () => {
    type = b.dataset.type;
    main.querySelectorAll("[data-type]").forEach((x) => x.classList.toggle("valgt", x === b));
    main.querySelector("#pdfFelt").hidden = type !== "pdf";
    main.querySelector("#lenkeFelt").hidden = type !== "lenke";
  }));

  main.querySelector("#fil").addEventListener("change", async (e) => {
    const fil = e.target.files[0];
    e.target.value = "";
    if (!fil) return;
    if (fil.type !== "application/pdf" && !/\.pdf$/i.test(fil.name)) return melding("Fila må være en PDF.", "feil");
    if (fil.size > MAKS_MB * 1024 * 1024) return melding(`PDF-en er for stor (${storrelse(fil.size)}). Maks er ${MAKS_MB} MB.`, "feil");
    try {
      const data = await lesSomDataUrl(fil);
      pdf = { navn: fil.name, storrelse: fil.size, base64: data.slice(data.indexOf(",") + 1) };
      main.querySelector("#filInfo").textContent = `Valgt: ${fil.name} (${storrelse(fil.size)}). Lagres når du trykker «${ny ? "Legg til" : "Lagre"}».`;
      if (!f.elements.tittel.value.trim()) f.elements.tittel.value = fil.name.replace(/\.pdf$/i, "");
    } catch (err) {
      melding(feilmelding(err), "feil");
    }
  });

  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f));
    const lenke = type === "lenke" ? v.lenke.trim() : "";
    if (type === "lenke" && !erLenke(lenke)) return melding("Skriv en hel adresse som begynner med https://", "feil");
    if (type === "pdf" && !pdf && !r.fil) return melding("Velg en PDF-fil først.", "feil");
    await medKnapp(e.submitter, async () => {
      await lagreRegel(ny ? null : r, {
        kategori: v.kategori, tittel: v.tittel.trim(), beskrivelse: v.beskrivelse.trim(), dato: v.dato || "", lenke,
      }, type === "pdf" ? pdf : null);
      melding(ny ? "Dokumentet er lagt til." : "Endringene er lagret.");
      gaaTil("regelverk");
    });
  });

  main.querySelector("#slett")?.addEventListener("click", async (e) => {
    if (!(await bekreft(`Slette «${r.tittel}» fra regelverket?`, { ja: "Slett", farlig: true }))) return;
    await medKnapp(e.currentTarget, async () => {
      await slettRegel(r);
      melding("Dokumentet er slettet.");
      gaaTil("regelverk");
    });
  });
}
skjema.tittel = "Regelverk";
skjema.trenger = ["regelverk"];
