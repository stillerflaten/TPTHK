// Regelverk: vedtekter, statutter og andre regler for klubben, samlet ett sted.
// Alle med innlogging kan lese. Styret (og kasserere) legger inn, endrer og fjerner dokumenter.
// Et dokument er enten en fil (PDF eller Word, lagret i databasen) eller en lenke til en annen nettside.
// Word-dokumenter (.docx) vises som tekst rett på siden, og kan også lastes ned.

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
const filtype = (fil) => (/\.docx?$/i.test(fil?.navn || "") ? "Word" : "PDF");
const MIME = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
};
const endelse = (navn) => (String(navn).match(/\.(pdf|docx?)$/i)?.[1] || "").toLowerCase();
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
              r.fil ? `${filtype(r.fil)}, ${storrelse(r.fil.storrelse || 0)}` : erLenke(r.lenke) ? vert(r.lenke) : "",
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

/** Åpner PDF-en i ny fane. Blokkerer nettleseren det, lastes den ned i stedet. Word-dokumenter vises på egen side. */
async function apne(r) {
  if (endelse(r.fil.navn) === "docx") return gaaTil(`regel/${r.id}`);
  const blob = await hentBlob(r);
  if (endelse(r.fil.navn) === "doc") return lastNed(r.fil.navn, blob); // gammelt Word-format kan ikke vises i nettleseren
  const url = URL.createObjectURL(blob);
  const vindu = window.open(url, "_blank");
  if (!vindu) lastNed(r.fil.navn || `${r.tittel}.pdf`, blob);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function hentBlob(r) {
  const b64 = await hentRegelfil(r.fil);
  return dataUrlTilBlob(`data:${MIME[endelse(r.fil.navn)] || MIME.pdf};base64,${b64}`);
}

// ---------- Les et Word-dokument ----------

export async function les(main, S, id) {
  const r = S.regelverk.find((x) => x.id === id);
  if (!r?.fil) {
    main.innerHTML = `<div class="tom">Fant ikke dokumentet. <a href="#/regelverk">Tilbake</a></div>`;
    return;
  }
  main.innerHTML = html`
    <div class="sidetopp"><h1>${r.tittel}</h1><a class="lenkeknapp" href="#/regelverk">Tilbake</a></div>
    ${r.beskrivelse ? raw(html`<p class="hint">${r.beskrivelse}</p>`) : ""}
    <p><button class="knapp sekundaer liten" id="lastNed">${raw(ikon("binders"))} Last ned Word-fila</button></p>
    <article class="kort regel-tekst" id="tekst"><p class="hint">Henter dokumentet …</p></article>`;

  let blob = null;
  main.querySelector("#lastNed").addEventListener("click", (e) => medKnapp(e.currentTarget, async () => {
    blob ??= await hentBlob(r);
    lastNed(r.fil.navn, blob);
  }));

  const tekst = main.querySelector("#tekst");
  try {
    const [mammoth, b] = await Promise.all([hentMammoth(), hentBlob(r)]);
    blob = b;
    const { value } = await mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() });
    if (!tekst.isConnected) return; // brukeren har gått videre
    tekst.replaceChildren(...rensHtml(value));
    if (!tekst.childNodes.length) tekst.innerHTML = `<p class="hint">Dokumentet ser ut til å være tomt. Last ned fila for å se den i Word.</p>`;
  } catch (err) {
    if (tekst.isConnected) tekst.innerHTML = html`<p class="hint">Klarte ikke å vise dokumentet her (${feilmelding(err)}). Last ned fila og åpne den i Word i stedet.</p>`;
  }
}
les.tittel = "Regelverk";
les.trenger = ["regelverk"];

// Biblioteket som gjør Word om til tekst (mammoth) ligger i public/vendor og lastes først når noen åpner et Word-dokument.
let bibliotek = null;
function hentMammoth() {
  bibliotek ??= new Promise((ok, feil) => {
    if (window.mammoth) return ok(window.mammoth);
    const s = Object.assign(document.createElement("script"), { src: "vendor/mammoth.browser.min.js" });
    s.onload = () => ok(window.mammoth);
    s.onerror = () => { bibliotek = null; feil(new Error("klarte ikke å laste Word-verktøyet, sjekk nettet")); };
    document.head.append(s);
  });
  return bibliotek;
}

/** Slipper bare gjennom vanlig tekstformatering fra Word-dokumentet, aldri skript eller farlige lenker. */
const TILLATT = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6", "STRONG", "EM", "U", "S", "SUP", "SUB", "BR",
  "UL", "OL", "LI", "TABLE", "THEAD", "TBODY", "TR", "TH", "TD", "A", "IMG", "BLOCKQUOTE"]);
function rensHtml(kilde) {
  const doc = new DOMParser().parseFromString(`<body>${kilde}</body>`, "text/html");
  const rens = (node) => {
    for (const barn of [...node.children]) {
      if (!TILLATT.has(barn.tagName)) {
        // Ukjente elementer fjernes, men teksten inni beholdes (bortsett fra skript o.l.).
        if (["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED"].includes(barn.tagName)) barn.remove();
        else { rens(barn); barn.replaceWith(...barn.childNodes); }
        continue;
      }
      for (const a of [...barn.attributes]) {
        const ok = (barn.tagName === "A" && a.name === "href" && /^(https?:|mailto:|#)/i.test(a.value))
          || (barn.tagName === "IMG" && a.name === "src" && /^data:image\//i.test(a.value))
          || (barn.tagName === "IMG" && a.name === "alt")
          || (["TD", "TH"].includes(barn.tagName) && ["colspan", "rowspan"].includes(a.name));
        if (!ok) barn.removeAttribute(a.name);
      }
      if (barn.tagName === "A" && barn.hasAttribute("href") && !barn.getAttribute("href").startsWith("#")) {
        barn.target = "_blank";
        barn.rel = "noopener noreferrer";
      }
      rens(barn);
    }
  };
  rens(doc.body);
  return [...doc.body.childNodes];
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
  let type = r.lenke ? "lenke" : "fil";
  let valgtFil = null;

  main.innerHTML = html`
    <div class="sidetopp"><h1>${ny ? "Legg til dokument" : "Endre dokument"}</h1><a class="lenkeknapp" href="#/regelverk">Avbryt</a></div>
    <form id="skjema" class="skjema kort">
      <label>Kategori<select name="kategori">${KATEGORIER.map(([k, navn]) => raw(html`<option value="${k}" ${r.kategori === k ? "selected" : ""}>${navn}</option>`))}</select></label>
      <label>Tittel<input name="tittel" value="${r.tittel || ""}" maxlength="200" required placeholder="F.eks. Vedtekter for TPTHK"></label>
      <label>Kort beskrivelse (valgfritt)<textarea name="beskrivelse" rows="2" maxlength="500" placeholder="F.eks. Vedtatt på årsmøtet 2026">${r.beskrivelse || ""}</textarea></label>
      <label>Gjelder fra (valgfritt)<input type="date" name="dato" value="${r.dato || ""}"></label>

      <div class="veksler">
        <button type="button" data-type="fil" class="${type === "fil" ? "valgt" : ""}">Fil (PDF eller Word)</button>
        <button type="button" data-type="lenke" class="${type === "lenke" ? "valgt" : ""}">Lenke</button>
      </div>
      <div id="filFelt" ${type === "fil" ? "" : "hidden"}>
        <p id="filInfo" class="hint">${r.fil ? `Lagret fil: ${r.fil.navn} (${storrelse(r.fil.storrelse || 0)}). Velg en ny fil hvis du vil bytte den ut.` : `Velg en PDF eller et Word-dokument på maks ${MAKS_MB} MB.`}</p>
        <label class="knapp sekundaer filknapp">${raw(ikon("binders"))} ${r.fil ? "Bytt fil" : "Velg fil"}
          <input type="file" id="fil" accept="${Object.values(MIME).join(",")},.pdf,.docx,.doc" hidden></label>
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
    main.querySelector("#filFelt").hidden = type !== "fil";
    main.querySelector("#lenkeFelt").hidden = type !== "lenke";
  }));

  main.querySelector("#fil").addEventListener("change", async (e) => {
    const fil = e.target.files[0];
    e.target.value = "";
    if (!fil) return;
    if (!endelse(fil.name)) return melding("Fila må være en PDF eller et Word-dokument (.docx eller .doc).", "feil");
    if (fil.size > MAKS_MB * 1024 * 1024) return melding(`Fila er for stor (${storrelse(fil.size)}). Maks er ${MAKS_MB} MB.`, "feil");
    try {
      const data = await lesSomDataUrl(fil);
      valgtFil = { navn: fil.name, storrelse: fil.size, base64: data.slice(data.indexOf(",") + 1) };
      main.querySelector("#filInfo").textContent = `Valgt: ${fil.name} (${storrelse(fil.size)}). Lagres når du trykker «${ny ? "Legg til" : "Lagre"}».`;
      if (!f.elements.tittel.value.trim()) f.elements.tittel.value = fil.name.replace(/\.(pdf|docx?)$/i, "");
    } catch (err) {
      melding(feilmelding(err), "feil");
    }
  });

  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f));
    const lenke = type === "lenke" ? v.lenke.trim() : "";
    if (type === "lenke" && !erLenke(lenke)) return melding("Skriv en hel adresse som begynner med https://", "feil");
    if (type === "fil" && !valgtFil && !r.fil) return melding("Velg en fil først.", "feil");
    await medKnapp(e.submitter, async () => {
      await lagreRegel(ny ? null : r, {
        kategori: v.kategori, tittel: v.tittel.trim(), beskrivelse: v.beskrivelse.trim(), dato: v.dato || "", lenke,
      }, type === "fil" ? valgtFil : null);
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
