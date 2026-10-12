// Møter: innkallinger og referater fra styremøter og årsmøter, med elektronisk signering av referatet.
// Styret (og kasserere) legger ut. Alle med innlogging kan lese. De styret velger, signerer referatet her.

import { html, raw, datoTekst, iDag, lastNed } from "../util.js";
import { lagInnkallingPdf } from "../innkallingPdf.js";
import {
  lagreMote, slettMote, hentReferatutkast, lagreReferatutkast, sendTilSignering, trekkTilbakeReferat,
  signerReferat, markerGodkjent, referatHash, normalEpost,
} from "../firebase.js";
import { melding, medKnapp, bekreft } from "../ui.js";
import { gaaTil } from "../app.js";
import { ikon } from "../ikoner.js";
import { erStyret } from "../tilgang.js";

export const typeTekst = { styremote: "Styremøte", medlemsmote: "Medlemsmøte", arsmote: "Årsmøte" };
// Årsmøter og medlemsmøter er åpne for alle medlemmer.
const erAapent = (m) => m.type === "arsmote" || m.type === "medlemsmote";
const referatTekst = {
  ingen: "Referat ikke skrevet",
  utkast: "Referat under arbeid",
  signering: "Referat til signering",
  godkjent: "Referat godkjent",
};
const referatKlasse = { ingen: "", utkast: "", signering: "status-sendt", godkjent: "status-utbetalt" };

export { erStyret } from "../tilgang.js";
const meg = (S) => normalEpost(S.bruker.email);
const signaturerFor = (S, id) => S.signaturer.filter((s) => s.moteId === id);
const harSignert = (S, mote, epost) => signaturerFor(S, mote.id).some((s) => s.epost === epost);

/** Referater som venter på at den innloggede signerer. Brukes også til tallet i menyen. */
export function venterPaaMeg(S) {
  const e = meg(S);
  return S.moter.filter((m) => m.referatStatus === "signering" && (m.signatarer || []).includes(e) && !harSignert(S, m, e));
}

const motetittel = (m) => m.tittel || `${typeTekst[m.type]} ${datoTekst(m.dato)}`;
const statusMerke = (m) => (m.referatStatus === "ingen" ? "" : html`<span class="status ${referatKlasse[m.referatStatus]}">${referatTekst[m.referatStatus]}</span>`);
const tidspunkt = (t) => (t?.toDate ? t.toDate().toLocaleString("nb-NO", { dateStyle: "short", timeStyle: "short" }) : "akkurat nå");

// ---------- Liste ----------

const filter = { fane: "kommende", type: "alle" };

export function liste(main, S) {
  const idag = iDag();
  const passer = (m) => filter.type === "alle" || m.type === filter.type;
  const kommende = S.moter.filter((m) => m.dato >= idag && passer(m)).sort((a, b) => a.dato.localeCompare(b.dato));
  const tidligere = S.moter.filter((m) => m.dato < idag && passer(m)).sort((a, b) => b.dato.localeCompare(a.dato));
  const vis = filter.fane === "kommende" ? kommende : tidligere;
  const venter = venterPaaMeg(S);

  main.innerHTML = html`
    <div class="sidetopp">
      <h1>Møter</h1>
      <div class="knapperad">
        <a class="knapp sekundaer" href="#/styret">${raw(ikon("medlemmer"))} Styret</a>
        ${erStyret(S) ? raw(`<a class="knapp" href="#/mote-skjema/ny">+ Ny innkalling</a>`) : ""}
      </div>
    </div>

    ${venter.map((m) => raw(html`
      <a class="varsel info lenke" href="#/mote/${m.id}">${raw(ikon("signer"))}
        <span>Referatet fra <strong>${motetittel(m)}</strong> venter på din signatur.</span></a>`))}

    <div class="faner">
      <button data-fane="kommende" class="${filter.fane === "kommende" ? "valgt" : ""}">Kommende (${kommende.length})</button>
      <button data-fane="tidligere" class="${filter.fane === "tidligere" ? "valgt" : ""}">Tidligere (${tidligere.length})</button>
    </div>
    <div class="filterlinje en">
      <select id="type" aria-label="Møtetype">
        <option value="alle" ${filter.type === "alle" ? "selected" : ""}>Alle møter</option>
        <option value="styremote" ${filter.type === "styremote" ? "selected" : ""}>Styremøter</option>
        <option value="medlemsmote" ${filter.type === "medlemsmote" ? "selected" : ""}>Medlemsmøter</option>
        <option value="arsmote" ${filter.type === "arsmote" ? "selected" : ""}>Årsmøter</option>
      </select>
    </div>

    ${vis.length ? raw(html`<ul class="postliste moteliste">${vis.map((m) => raw(html`
      <li><a href="#/mote/${m.id}">
        <span class="post-dato">${datoTekst(m.dato)}</span>
        <span class="post-tekst">
          <span>${motetittel(m)}</span>
          <span class="post-kategori">${typeTekst[m.type]}${erAapent(m) ? ", åpent for alle" : ""}${m.sted ? ` · ${m.sted}` : ""} ${raw(statusMerke(m))}</span>
        </span>
        <span class="post-pil">${raw(ikon("pil"))}</span>
      </a></li>`))}</ul>`)
    : raw(`<div class="tom">${filter.fane === "kommende" ? "Ingen kommende møter er lagt ut." : "Ingen tidligere møter ennå."}</div>`)}`;

  main.querySelectorAll("[data-fane]").forEach((b) => b.addEventListener("click", () => { filter.fane = b.dataset.fane; liste(main, S); }));
  main.querySelector("#type").addEventListener("change", (e) => { filter.type = e.target.value; liste(main, S); });
}
liste.live = true;
liste.tittel = "Møter";
liste.trenger = ["moter", "signaturer"];

// ---------- Innkalling som PDF og på e-post ----------
// Innkallingen lages som PDF med logo. Nettleseren kan ikke legge ved filer i en e-post av seg selv,
// så «Send på e-post» laster ned PDF-en og åpner e-postprogrammet med mottakerne i Bcc. Da legger man ved fila selv.
// På telefon kan «Del PDF» sende fila rett til Mail, Outlook o.l.

/** Hvem som skal ha innkallingen: aktive medlemmer med e-post, eller bare styret for styremøter. */
function mottakere(S, m) {
  if (!erAapent(m)) return [...new Set((S.personer || []).filter((p) => p.styre).map((p) => p.epost))];
  return [...new Set(S.medlemmer.filter((x) => x.aktiv !== false && x.epost).map((x) => normalEpost(x.epost)))];
}

const kanDeleFil = () => {
  try {
    return !!navigator.canShare?.({ files: [new File(["x"], "test.pdf", { type: "application/pdf" })] });
  } catch {
    return false;
  }
};

function epostboks(S, m) {
  const klar = erAapent(m) ? S.lastet.has("medlemmer") : S.lastet.has("personer");
  const antall = klar ? mottakere(S, m).length : 0;
  const hvem = erAapent(m) ? `alle ${antall} aktive medlemmer med e-post` : `styret (${antall})`;
  return html`
    <div class="epostboks">
      <p class="hint">${!klar ? "Henter mottakerne …"
        : antall ? `Innkallingen lages som PDF med logo og sendes til ${hvem}. «Send på e-post» laster ned PDF-en og åpner e-postprogrammet med adressene som blindkopi (Bcc). Legg ved PDF-en før du sender.${kanDeleFil() ? " «Del PDF» sender fila rett til e-postappen og kopierer adressene, så du kan lime dem inn." : ""}`
        : erAapent(m) ? "Ingen aktive medlemmer har e-post i medlemslisten. Du kan likevel laste ned PDF-en."
        : "Fant ingen i styret med e-post. Du kan likevel laste ned PDF-en."}</p>
      <div class="knapperad">
        <button type="button" class="knapp sekundaer liten" id="lastNedPdf">${raw(ikon("lastned"))} Last ned PDF</button>
        ${antall ? raw(html`
          <button type="button" class="knapp liten" id="sendEpost">${raw(ikon("send"))} Send på e-post</button>
          ${kanDeleFil() ? raw(`<button type="button" class="knapp sekundaer liten" id="delPdf">Del PDF</button>`) : ""}
          <button type="button" class="knapp sekundaer liten" id="kopierAdresser">Kopier adressene</button>`) : ""}
      </div>
    </div>`;
}

const moteLenke = (m) => `${location.origin}${location.pathname}#/mote/${m.id}`;

function epostTekst(m) {
  return [
    "Hei!",
    "",
    `Vedlagt er innkalling til ${typeTekst[m.type].toLowerCase()}${m.tittel ? `: ${m.tittel}` : ""}.`,
    "",
    `Tid: ${datoTekst(m.dato)}${m.tid ? ` kl. ${m.tid}` : ""}`,
    m.sted ? `Sted: ${m.sted}` : null,
    "",
    `Innkallingen ligger også på nettsiden: ${moteLenke(m)}`,
  ].filter((x) => x !== null).join("\n");
}

async function kopier(tekst, ok) {
  try {
    await navigator.clipboard.writeText(tekst);
    melding(ok);
  } catch {
    melding("Klarte ikke å kopiere. Prøv igjen.", "feil");
  }
}

const lagPdf = (S, m) => lagInnkallingPdf(m, {
  klubbnavn: S.innst.klubbnavn, typeTekst: typeTekst[m.type], aapent: erAapent(m), lenke: moteLenke(m),
});

function kobleEpost(main, S, m) {
  const emne = `Innkalling: ${motetittel(m)}`;
  main.querySelector("#lastNedPdf")?.addEventListener("click", (e) => medKnapp(e.currentTarget, async () => {
    const { blob, filnavn } = await lagPdf(S, m);
    lastNed(filnavn, blob);
  }));
  main.querySelector("#sendEpost")?.addEventListener("click", (e) => {
    const adr = mottakere(S, m);
    const url = `mailto:?bcc=${adr.map(encodeURIComponent).join(",")}&subject=${encodeURIComponent(emne)}&body=${encodeURIComponent(epostTekst(m).replace(/\n/g, "\r\n"))}`;
    // Svært lange lenker (mange mottakere) kan e-postprogrammer avvise. Da er kopiering tryggere.
    const forLang = url.length > 8000;
    medKnapp(e.currentTarget, async () => {
      const { blob, filnavn } = await lagPdf(S, m);
      lastNed(filnavn, blob);
      if (forLang) {
        await kopier(adr.join(", "), "PDF-en er lastet ned og adressene kopiert. Det er for mange mottakere til å åpne e-postprogrammet direkte, så lim adressene inn i Bcc-feltet selv.");
        return;
      }
      melding(`PDF-en «${filnavn}» er lastet ned. Legg den ved e-posten som åpnes nå.`);
      setTimeout(() => { location.href = url; }, 400);
    });
  });
  const del = main.querySelector("#delPdf");
  if (del) {
    // Telefonen godtar bare deling rett etter et trykk, så PDF-en lages på forhånd.
    let fil = null;
    lagPdf(S, m).then(({ blob, filnavn }) => { fil = new File([blob], filnavn, { type: "application/pdf" }); }).catch(() => {});
    del.addEventListener("click", () => {
      if (!fil) return melding("PDF-en lages fortsatt. Prøv igjen om et øyeblikk.");
      navigator.clipboard?.writeText(mottakere(S, m).join(", ")).catch(() => {});
      navigator.share({ files: [fil], title: emne, text: epostTekst(m) }).catch((err) => {
        if (err?.name !== "AbortError") melding("Klarte ikke å dele PDF-en. Bruk «Send på e-post» i stedet.", "feil");
      });
    });
  }
  main.querySelector("#kopierAdresser")?.addEventListener("click", () =>
    kopier(mottakere(S, m).join(", "), "Adressene er kopiert. Lim dem inn i Bcc-feltet i e-posten."));
}

// ---------- Ett møte ----------

export function detalj(main, S, id) {
  const m = S.moter.find((x) => x.id === id);
  if (!m) {
    main.innerHTML = `<div class="tom">Fant ikke møtet. <a href="#/moter">Tilbake</a></div>`;
    return;
  }
  const e = meg(S);
  const styret = erStyret(S);
  const sign = signaturerFor(S, m.id);
  const signatarer = m.signatarer || [];
  const kanSignere = m.referatStatus === "signering" && signatarer.includes(e) && !harSignert(S, m, e);
  const visReferat = m.referatStatus === "signering" || m.referatStatus === "godkjent";

  main.innerHTML = html`
    <div class="sidetopp"><h1>${motetittel(m)}</h1><a class="lenkeknapp" href="#/moter">Tilbake</a></div>

    <section class="kort">
      <h2>Innkalling</h2>
      <dl class="info">
        <dt>Møte</dt><dd>${typeTekst[m.type]}${erAapent(m) ? raw(` <span class="status status-utbetalt">Åpent for alle medlemmer</span>`) : ""}</dd>
        <dt>Tid</dt><dd>${datoTekst(m.dato)}${m.tid ? ` kl. ${m.tid}` : ""}</dd>
        ${m.sted ? raw(html`<dt>Sted</dt><dd>${m.sted}</dd>`) : ""}
      </dl>
      ${m.innkalling ? raw(html`<div class="fritekst dokumenttekst">${m.innkalling}</div>`) : raw(`<p class="hint">Ingen saksliste er lagt inn.</p>`)}
      ${styret && m.referatStatus !== "godkjent" ? raw(html`<div class="knapper venstre"><a class="knapp sekundaer liten" href="#/mote-skjema/${m.id}">Rediger innkalling</a></div>`) : ""}
      ${styret ? raw(epostboks(S, m)) : ""}
    </section>

    <section class="kort ${kanSignere ? "uthevet" : ""}">
      <h2>Referat ${raw(statusMerke(m))}</h2>
      ${visReferat ? raw(html`
        ${m.referatStatus === "signering" ? raw(`<p class="hint">Referatet er ikke godkjent før alle har signert.</p>`) : ""}
        <div class="fritekst dokumenttekst">${m.referat}</div>
        <div id="kontroll" class="hint"></div>`)
      : raw(html`<p class="hint">${m.referatStatus === "utkast" ? "Styret skriver på referatet. Det blir synlig her når det sendes til signering." : "Referatet er ikke skrevet ennå."}</p>`)}

      ${kanSignere ? raw(html`
        <div class="signerboks">
          <label class="avkryss"><input type="checkbox" id="lest"> Jeg har lest referatet og godkjenner det</label>
          <button class="knapp" id="signer">${raw(ikon("signer"))} Signer</button>
        </div>`) : ""}

      ${styret && m.referatStatus !== "signering" && m.referatStatus !== "godkjent" ? raw(html`
        <div class="knapper venstre"><a class="knapp" href="#/referat/${m.id}">${m.referatStatus === "ingen" ? "Skriv referat" : "Fortsett på referatet"}</a></div>`) : ""}
    </section>

    ${visReferat ? raw(html`
      <section class="kort">
        <h2>Signaturer (${sign.length} av ${signatarer.length})</h2>
        <ul class="enkel-liste">${signatarer.map((s) => {
          const sg = sign.find((x) => x.epost === s);
          return raw(html`<li>
            <span><strong>${m.signatarNavn?.[s] || s}</strong>${s === e ? " (deg)" : ""}</span>
            ${sg ? raw(html`<span class="signert">${raw(ikon("sjekk"))} Signert ${tidspunkt(sg.tidspunkt)}</span>`) : raw(`<span class="hint">Ikke signert</span>`)}
          </li>`);
        })}</ul>
        <p class="hint">Signeringen er en bekreftelse fra innlogget bruker med tidspunkt. Hver signatur lagres med en kontrollsum
          av referatteksten, så man kan se at teksten ikke er endret etter at den ble signert. Det er ikke BankID.</p>
        ${styret && m.referatStatus === "signering" ? raw(`<div class="knapper venstre"><button class="knapp sekundaer liten" id="trekk">Trekk tilbake for å endre</button></div>`) : ""}
      </section>`) : ""}

    ${styret && m.referatStatus !== "godkjent" ? raw(`<div class="knapper venstre"><button class="knapp farlig sekundaer liten" id="slett">Slett møtet</button></div>`) : ""}`;

  // Viser om teksten fortsatt er den samme som ble sendt til signering.
  if (visReferat && m.referatHash) {
    referatHash(m.id, m.referat || "").then((h) => {
      const el = main.querySelector("#kontroll");
      if (!el) return;
      const ok = h === m.referatHash && sign.every((s) => s.hash === m.referatHash);
      el.innerHTML = ok
        ? html`${raw(ikon("sjekk"))} Kontrollsum ${m.referatHash.slice(0, 12)} stemmer med teksten.`
        : `Kontrollsummen stemmer ikke med teksten. Si fra til styret.`;
      el.classList.toggle("kontroll-ok", ok);
    }).catch(() => {});
  }

  // Alle har signert, men ingen rakk å markere referatet som godkjent (f.eks. to signerte samtidig).
  if (m.referatStatus === "signering" && signatarer.length && signatarer.every((s) => sign.some((x) => x.epost === s))
    && signatarer.includes(e)) {
    markerGodkjent(m).catch(() => {});
  }

  kobleEpost(main, S, m);
  const lest = main.querySelector("#lest");
  main.querySelector("#signer")?.addEventListener("click", (ev) => {
    if (!lest.checked) return melding("Huk av for at du har lest referatet først.", "feil");
    medKnapp(ev.currentTarget, async () => {
      const andre = signatarer.filter((s) => s !== e);
      const erSist = andre.every((s) => sign.some((x) => x.epost === s));
      await signerReferat(m, S.profil.navn || S.bruker.email, erSist);
      melding(erSist ? "Takk! Du var sist, så referatet er nå godkjent." : "Takk! Signaturen din er registrert.");
    });
  });

  main.querySelector("#trekk")?.addEventListener("click", async (ev) => {
    const tekst = sign.length
      ? `Trekke tilbake referatet? De ${sign.length} signaturene som er gitt, blir slettet, og alle må signere på nytt.`
      : "Trekke tilbake referatet for å endre det?";
    if (!(await bekreft(tekst, { ja: "Trekk tilbake" }))) return;
    await medKnapp(ev.currentTarget, async () => {
      await trekkTilbakeReferat(m, sign);
      gaaTil(`referat/${m.id}`);
    });
  });

  main.querySelector("#slett")?.addEventListener("click", async (ev) => {
    if (!(await bekreft(`Slette ${motetittel(m)} med innkalling og referat?`, { ja: "Slett", farlig: true }))) return;
    await medKnapp(ev.currentTarget, async () => {
      await slettMote(m, sign);
      melding("Møtet er slettet.");
      gaaTil("moter");
    });
  });
}
detalj.live = true;
detalj.tittel = "Møte";
detalj.trenger = ["moter", "signaturer"];

// ---------- Innkalling (styret) ----------

export function skjema(main, S, id) {
  if (!erStyret(S)) return gaaTil("moter");
  const ny = id === "ny";
  const m = ny ? { type: "styremote", dato: iDag() } : S.moter.find((x) => x.id === id);
  if (!m || m.referatStatus === "godkjent") {
    main.innerHTML = `<div class="tom">Møtet finnes ikke, eller referatet er godkjent og låst. <a href="#/moter">Tilbake</a></div>`;
    return;
  }
  main.innerHTML = html`
    <div class="sidetopp"><h1>${ny ? "Ny innkalling" : "Rediger innkalling"}</h1><a class="lenkeknapp" href="${ny ? "#/moter" : `#/mote/${m.id}`}">Avbryt</a></div>
    <form id="skjema" class="skjema kort">
      <div class="veksler tre">
        <button type="button" data-type="styremote" class="${m.type === "styremote" ? "valgt" : ""}">Styremøte</button>
        <button type="button" data-type="medlemsmote" class="${m.type === "medlemsmote" ? "valgt" : ""}">Medlemsmøte</button>
        <button type="button" data-type="arsmote" class="${m.type === "arsmote" ? "valgt" : ""}">Årsmøte</button>
      </div>
      <label>Tittel (valgfritt)<input name="tittel" value="${m.tittel || ""}" maxlength="120" placeholder="F.eks. Årsmøte ${m.dato.slice(0, 4)}"></label>
      <div class="to-kol">
        <label>Dato<input type="date" name="dato" value="${m.dato}" required></label>
        <label>Klokkeslett<input type="time" name="tid" value="${m.tid || ""}"></label>
      </div>
      <label>Sted<input name="sted" value="${m.sted || ""}" maxlength="200" placeholder="F.eks. Klubbhuset, eller Teams"></label>
      <label>Innkalling og saksliste<textarea name="innkalling" rows="12" placeholder="Sak 1: Godkjenning av innkalling og saksliste&#10;Sak 2: …">${m.innkalling || ""}</textarea></label>
      <p class="hint">Alle med innlogging kan lese innkallingen så snart den er lagret.</p>
      <div class="knapper"><button type="submit" class="knapp">${ny ? "Legg ut innkalling" : "Lagre"}</button></div>
    </form>`;

  let type = m.type;
  main.querySelectorAll("[data-type]").forEach((b) => b.addEventListener("click", () => {
    type = b.dataset.type;
    main.querySelectorAll("[data-type]").forEach((x) => x.classList.toggle("valgt", x === b));
  }));
  const f = main.querySelector("#skjema");
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f));
    await medKnapp(e.submitter, async () => {
      const nyId = await lagreMote(ny ? null : m.id, {
        type, tittel: v.tittel.trim(), dato: v.dato, tid: v.tid, sted: v.sted.trim(), innkalling: v.innkalling.trim(),
      });
      melding(ny ? "Innkallingen er lagt ut." : "Innkallingen er lagret.");
      gaaTil(`mote/${nyId}`);
    });
  });
}
skjema.tittel = "Innkalling";
skjema.trenger = ["moter"];

// ---------- Referat (styret) ----------

export async function referat(main, S, id) {
  const m = S.moter.find((x) => x.id === id);
  if (!erStyret(S) || !m) return gaaTil("moter");
  if (m.referatStatus === "signering" || m.referatStatus === "godkjent") return gaaTil(`mote/${m.id}`);

  const utkast = await hentReferatutkast(m.id);
  const personer = [...(S.personer || [])].sort((a, b) => Number(b.styre) - Number(a.styre) || (a.navn || a.epost).localeCompare(b.navn || b.epost, "nb"));
  // Styremøte: hele styret signerer som standard. Årsmøte: møteleder og protokollvitner velges.
  const valgt = new Set(utkast?.signatarer || (m.type === "styremote" ? personer.filter((p) => p.styre).map((p) => p.epost) : []));
  const mal = erAapent(m)
    ? "Til stede: \n\nSak 1: Konstituering (valg av møteleder, referent og to protokollvitner)\nVedtak: \n\nSak 2: \nVedtak: \n"
    : "Til stede: \nForfall: \n\nSak 1: \nVedtak: \n";

  main.innerHTML = html`
    <div class="sidetopp"><h1>Referat: ${motetittel(m)}</h1><a class="lenkeknapp" href="#/mote/${m.id}">Tilbake</a></div>
    <form id="skjema" class="skjema kort">
      <label>Referat<textarea name="tekst" rows="18">${utkast?.tekst ?? mal}</textarea></label>
      <p class="hint">Utkastet ser bare styret. Når du sender det til signering, kan alle med innlogging lese det.</p>
    </form>
    <section class="kort">
      <h2>Hvem skal signere?</h2>
      <p class="hint">${erAapent(m) ? "Vanligvis møteleder og to protokollvitner." : "Vanligvis styremedlemmene som var til stede."}
        Bare personer med innlogging kan velges. Mangler noen, må kassereren gi dem innlogging under Medlemmer.</p>
      ${personer.length ? raw(html`<div class="velgliste">${personer.map((p) => raw(html`
        <label class="avkryss"><input type="checkbox" name="signatar" value="${p.epost}" ${valgt.has(p.epost) ? "checked" : ""}>
          <span>${p.navn || p.epost}${p.styre ? raw(` <span class="status">styret</span>`) : ""}</span></label>`))}</div>`)
      : raw(`<p class="hint">Fant ingen personer. Kassereren må logge inn én gang for at listen skal bli oppdatert.</p>`)}
      <div class="knapper">
        <button type="button" class="knapp sekundaer" id="lagre">Lagre utkast</button>
        <button type="button" class="knapp" id="send">${raw(ikon("signer"))} Send til signering</button>
      </div>
    </section>`;

  const f = main.querySelector("#skjema");
  const verdier = () => {
    const signatarer = [...main.querySelectorAll("[name=signatar]:checked")].map((c) => c.value);
    return { tekst: f.elements.tekst.value.trim(), signatarer };
  };

  main.querySelector("#lagre").addEventListener("click", (e) => medKnapp(e.currentTarget, async () => {
    await lagreReferatutkast(m, verdier());
    melding("Utkastet er lagret.");
  }));

  main.querySelector("#send").addEventListener("click", async (e) => {
    const v = verdier();
    if (!v.tekst) return melding("Referatet er tomt.", "feil");
    if (!v.signatarer.length) return melding("Velg minst én som skal signere.", "feil");
    const navn = Object.fromEntries(v.signatarer.map((ep) => [ep, personer.find((p) => p.epost === ep)?.navn || ep]));
    if (!(await bekreft(`Sende referatet til signering hos ${Object.values(navn).join(", ")}? Teksten kan ikke endres uten at det trekkes tilbake.`, { ja: "Send" }))) return;
    await medKnapp(e.currentTarget, async () => {
      await sendTilSignering(m, { ...v, navn });
      melding("Referatet er sendt til signering.");
      gaaTil(`mote/${m.id}`);
    });
  });
}
referat.tittel = "Referat";
referat.trenger = ["moter", "personer"];
