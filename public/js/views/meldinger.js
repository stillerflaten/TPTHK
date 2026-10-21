// Meldinger til styret: medlemmene sender henvendelser, styret leser og svarer her.
// Et medlem ser bare sine egne saker. Bare de som sitter i styret (og kasserere) ser alle. Administratoren ser dem ikke.

import { html, raw } from "../util.js";
import {
  sendMelding, svarPaaMelding, merkMeldingLest, settMeldingStatus, slettMelding, hentMeldingsvedlegg,
  varsleStyretOmMelding, varsleOmSvar, normalEpost,
} from "../firebase.js";
import { melding, medKnapp, bekreft, kvitteringsvelger, visKvittering } from "../ui.js";
import { gaaTil } from "../app.js";
import { ikon } from "../ikoner.js";
import { seMeldinger } from "../tilgang.js";

const meg = (S) => normalEpost(S.bruker.email);
const tid = (t) => t?.toMillis?.() ?? Date.now();
const tidspunkt = (t) => (t?.toDate ? t.toDate().toLocaleString("nb-NO", { dateStyle: "short", timeStyle: "short" }) : "akkurat nå");
const dato = (t) => (t?.toDate ? t.toDate().toLocaleDateString("nb-NO", { day: "numeric", month: "short" }) : "nå");

/** Innleggene i en sak, eldste først. */
const innleggI = (S, id) => S.meldingsinnlegg.filter((i) => i.meldingId === id).sort((a, b) => tid(a.tid) - tid(b.tid));

/**
 * Ulest for meg: noen andre har skrevet siden jeg sist så på saken.
 * Styret får bare varsel om det medlemmet skriver (ikke når et annet styremedlem har svart). Medlemmet får varsel om svar fra styret.
 */
export function erUlest(S, m) {
  if ((m.lestAv || []).includes(meg(S))) return false;
  if (m.epost === meg(S)) return m.sistFra === "styret";
  return seMeldinger(S) && m.sistFra === "medlem";
}
/** Antall uleste saker, til tallet i menyen. */
export const uleste = (S) => (S.meldinger || []).filter((m) => erUlest(S, m)).length;

/** Til e-postvarselet: alle i styret unntatt den som skriver. */
const styreAdresser = (S) => (S.verv?.styre || []).filter((e) => e !== meg(S));

async function varsleStyret(S) {
  const adresser = styreAdresser(S);
  // Meldingen er sendt uansett om varselet feiler.
  if (adresser.length) await varsleStyretOmMelding(adresser).catch(() => {});
}

// ---------- Lista ----------

let fane = "apne";

export function liste(main, S) {
  const styret = seMeldinger(S);
  const alle = [...S.meldinger].sort((a, b) => tid(b.sist) - tid(a.sist));
  // Styret ser alle sakene, delt i åpne og ferdige. Medlemmet ser sine egne.
  const apne = alle.filter((m) => m.status !== "ferdig");
  const ferdige = alle.filter((m) => m.status === "ferdig");
  const vis = styret ? (fane === "apne" ? apne : ferdige) : alle;

  main.innerHTML = html`
    <div class="sidetopp">
      <h1>${styret ? "Meldinger til styret" : "Meldinger"}</h1>
      ${styret ? "" : raw(`<a class="knapp" href="#/ny-melding">+ Ny melding</a>`)}
    </div>
    <p class="hint">${styret
      ? "Henvendelser fra medlemmene. Alle i styret ser dem og kan svare. Medlemmet får e-post når dere har svart, og ser svaret her."
      : "Her kan du sende en melding til styret i klubben. Bare styret ser det du skriver. Du får e-post når styret har svart."}</p>
    ${styret ? raw(html`
      <div class="faner">
        <button data-fane="apne" class="${fane === "apne" ? "valgt" : ""}">Åpne (${apne.length})</button>
        <button data-fane="ferdige" class="${fane === "ferdige" ? "valgt" : ""}">Ferdige (${ferdige.length})</button>
      </div>`) : ""}
    ${vis.length ? raw(html`<ul class="postliste moteliste meldingsliste">${vis.map((m) => raw(html`
      <li><a href="#/melding/${m.id}" class="${erUlest(S, m) ? "ulest" : ""}">
        <span class="post-dato">${dato(m.sist)}</span>
        <span class="post-tekst">
          <span>${m.emne}</span>
          <span class="post-kategori">${styret ? m.navn : (m.sistFra === "styret" ? "Styret har svart" : "Sendt til styret")}${m.status === "ferdig" ? raw(` · <span class="status status-utbetalt">Ferdig</span>`) : ""}${erUlest(S, m) ? raw(` · <span class="status status-sendt">Ny</span>`) : ""}</span>
        </span>
        <span class="post-pil">${raw(ikon("pil"))}</span>
      </a></li>`))}</ul>`)
    : raw(`<div class="tom">${styret ? (fane === "apne" ? "Ingen åpne meldinger." : "Ingen ferdige meldinger.") : "Du har ikke sendt noen meldinger ennå."}</div>`)}`;
  main.querySelectorAll("[data-fane]").forEach((b) => b.addEventListener("click", () => { fane = b.dataset.fane; liste(main, S); }));
}
liste.live = true;
liste.tittel = "Meldinger";
liste.trenger = ["meldinger"];

// ---------- Én sak ----------

export function detalj(main, S, id) {
  const m = S.meldinger.find((x) => x.id === id);
  if (!m) {
    main.innerHTML = `<div class="tom">Fant ikke meldingen. Den kan være slettet. <a href="#/meldinger">Tilbake</a></div>`;
    return;
  }
  const styret = seMeldinger(S);
  const egen = m.epost === meg(S);
  const innlegg = innleggI(S, m.id);
  // Svarer man på sin egen sak, er man medlemmet, selv om man sitter i styret.
  const fra = egen ? "medlem" : "styret";

  main.innerHTML = html`
    <div class="sidetopp"><h1>${m.emne}</h1><a class="lenkeknapp" href="#/meldinger">Tilbake</a></div>
    ${styret && !egen ? raw(html`<p class="hint">Fra ${m.navn} (${m.epost}) · ${m.status === "ferdig" ? "Ferdig" : "Åpen"}</p>`) : ""}
    <div class="samtale">${innlegg.map((i) => raw(html`
      <article class="innlegg ${i.fra === "styret" ? "fra-styret" : "fra-medlem"}">
        <div class="innlegg-topp"><strong>${i.fra === "styret" ? `Styret (${i.navn})` : i.navn}</strong><span>${tidspunkt(i.tid)}</span></div>
        <div class="fritekst">${i.tekst}</div>
        ${(i.vedlegg || []).length ? raw(html`<div class="brikker">${i.vedlegg.map((v, n) => raw(html`
          <button type="button" class="brikke" data-vedlegg="${v}">${raw(ikon("binders"))} Vedlegg ${i.vedlegg.length > 1 ? n + 1 : ""}</button>`))}</div>`) : ""}
      </article>`))}
    </div>

    <form id="svar" class="skjema kort">
      <label>${egen ? "Skriv til styret" : "Svar til medlemmet"}
        <textarea name="tekst" rows="4" required maxlength="5000"></textarea>
      </label>
      <div id="vedlegg"></div>
      <div class="knapper"><button class="knapp" type="submit">${raw(ikon("send"))} Send</button></div>
    </form>

    ${styret && !egen ? raw(html`
      <div class="knapper venstre">
        ${m.status === "ferdig"
          ? raw(`<button class="knapp sekundaer" id="aapne">Åpne igjen</button>`)
          : raw(`<button class="knapp sekundaer" id="ferdig">${ikon("sjekk")} Merk som ferdig</button>`)}
        <button class="knapp farlig sekundaer" id="slett">Slett meldingen</button>
      </div>`) : ""}`;

  // Merk som lest når den åpnes.
  if (!(m.lestAv || []).includes(meg(S))) merkMeldingLest(m).catch(() => {});

  main.querySelectorAll("[data-vedlegg]").forEach((b) => b.addEventListener("click", () =>
    visKvittering(b.dataset.vedlegg, { hent: hentMeldingsvedlegg, hva: "vedlegget" })));

  const skjema = main.querySelector("#svar");
  const velger = kvitteringsvelger(main.querySelector("#vedlegg"), { knapp: "Legg ved bilde eller PDF" });
  skjema.addEventListener("submit", async (e) => {
    e.preventDefault();
    const tekst = skjema.tekst.value.trim();
    if (!tekst) return melding("Skriv noe først.", "feil");
    if (velger.nye().length > 5) return melding("Du kan legge ved høyst 5 filer.", "feil");
    await medKnapp(e.submitter, async () => {
      await svarPaaMelding(m, { fra, navn: S.profil.navn || S.bruker.email, tekst, filer: velger.nye() });
      if (fra === "styret") await varsleOmSvar(m).catch(() => {});
      else await varsleStyret(S);
      melding(fra === "styret" ? "Svaret er sendt. Medlemmet får beskjed på e-post." : "Meldingen er sendt til styret.");
      detalj(main, S, id);
    });
  });

  main.querySelector("#ferdig")?.addEventListener("click", (e) => medKnapp(e.currentTarget, async () => {
    await settMeldingStatus(m, "ferdig");
    melding("Meldingen er merket som ferdig.");
    gaaTil("meldinger");
  }));
  main.querySelector("#aapne")?.addEventListener("click", (e) => medKnapp(e.currentTarget, async () => {
    await settMeldingStatus(m, "apen");
    melding("Meldingen er åpnet igjen.");
  }));
  main.querySelector("#slett")?.addEventListener("click", async (e) => {
    if (!(await bekreft("Slette meldingen med alle svar og vedlegg for godt? Medlemmet ser den heller ikke lenger.", { ja: "Slett", farlig: true }))) return;
    await medKnapp(e.currentTarget, async () => {
      await slettMelding(m, innlegg);
      melding("Meldingen er slettet.");
      gaaTil("meldinger");
    });
  });
}
// Ikke «live»: da ville svaret man holder på å skrive, forsvinne når det kommer noe nytt.
detalj.tittel = "Melding";
detalj.trenger = ["meldinger", "meldingsinnlegg"];

// ---------- Ny melding ----------

export function ny(main, S) {
  main.innerHTML = html`
    <div class="sidetopp"><h1>Ny melding til styret</h1><a class="lenkeknapp" href="#/meldinger">Avbryt</a></div>
    <form id="skjema" class="skjema kort">
      <label>Ditt navn<input name="navn" value="${S.profil.navn || ""}" autocomplete="name" required maxlength="100"></label>
      <label>Emne<input name="emne" required maxlength="150" placeholder="Hva gjelder det?"></label>
      <label>Melding<textarea name="tekst" rows="6" required maxlength="5000"></textarea></label>
      <div id="vedlegg"></div>
      <p class="hint">Bare de som sitter i styret, kan lese meldingen. Andre medlemmer ser den ikke.</p>
      <div class="knapper"><button class="knapp" type="submit">${raw(ikon("send"))} Send til styret</button></div>
    </form>`;

  const skjema = main.querySelector("#skjema");
  const velger = kvitteringsvelger(main.querySelector("#vedlegg"), { knapp: "Legg ved bilde eller PDF" });
  skjema.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(skjema));
    if (!f.navn.trim() || !f.emne.trim() || !f.tekst.trim()) return melding("Fyll ut navn, emne og melding.", "feil");
    if (velger.nye().length > 5) return melding("Du kan legge ved høyst 5 filer.", "feil");
    await medKnapp(e.submitter, async () => {
      const id = await sendMelding({ navn: f.navn.trim(), emne: f.emne.trim(), tekst: f.tekst.trim(), filer: velger.nye() });
      await varsleStyret(S);
      melding("Meldingen er sendt til styret.");
      gaaTil(`melding/${id}`);
    });
  });
}
ny.tittel = "Ny melding";
ny.trenger = ["meldinger", "verv"];
