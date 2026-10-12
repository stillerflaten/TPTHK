// Sikkerhetskopi: laster ned alle data som én ZIP-fil, og kan legge tilbake det som mangler.
//
// ZIP-fila inneholder:
//  • data/*.json     alt i databasen, nøyaktig som det er lagret (brukes til gjenoppretting)
//  • *.csv           regnskap, medlemmer og søknader, til å åpne i Excel
//  • kvitteringer/   alle kvitteringsbilder og PDF-er, navngitt etter bilagsnummer
//  • moter/          innkallinger og referater som tekst, med hvem som har signert
//  • regelverk/      vedtekter og andre regler som PDF eller Word
//
// Gjenoppretting legger bare tilbake dokumenter som mangler. Ingenting som finnes, blir endret eller slettet, bortsett fra at
// søknader og kontingent som hører til en post som legges tilbake, igjen merkes som utbetalt/betalt.

import { html, raw, datoTekst, tall, csvTekst, lastNed, iDag } from "../util.js";
import {
  hentSamling, hentDokument, erTidspunkt, tidspunktFra, merkSikkerhetskopi, skrivMange, normalEpost,
} from "../firebase.js";
import { melding, medKnapp, dialog } from "../ui.js";
import { lagZip, lesZip } from "../zip.js";
import { nummererBilag, aarFor, medStandard } from "../regnskap.js";
import { kontotekst } from "./poster.js";
import { statusTekst } from "./soknader.js";
import { typeTekst as moteType } from "./moter.js";
import { erKasserer, erAdmin, supportAktiv } from "../tilgang.js";
import { ikon } from "../ikoner.js";

const FORMAT = "tpthk-sikkerhetskopi";
const VERSJON = 1;
/** Hvor ofte det bør tas en kopi. Avtalen sier hvert kvartal. */
export const PAAMINN_DAGER = 90;

const SAMLINGER = ["brukere", "foresporsler", "poster", "medlemmer", "soknader", "kvitteringer", "moter", "referatutkast", "signaturer", "regelverk"];
const INNSTILLINGER = ["klubb", "medlemsinfo", "verv", "personer", "support"];

const NAVN = {
  brukere: ["innlogging", "innlogginger"], poster: ["post", "poster"], medlemmer: ["medlem", "medlemmer"],
  soknader: ["søknad", "søknader"], kvitteringer: ["kvittering", "kvitteringer"], moter: ["møte", "møter"],
  referatutkast: ["referatutkast", "referatutkast"], regelverk: ["dokument i regelverket", "dokumenter i regelverket"], innstillinger: ["innstilling", "innstillinger"],
};
const antallTekst = (samling, n) => `${n} ${NAVN[samling]?.[n === 1 ? 0 : 1] || samling}`;

// ---------- Når ble siste kopi tatt ----------

export function sisteKopi(S) {
  const s = S.innst.sisteSikkerhetskopi;
  const tid = s?.tid?.toMillis?.() ?? null;
  return tid ? { tid, navn: s.navn || s.av || "" } : null;
}

/** Sant når det aldri er tatt kopi, eller det er mer enn tre måneder siden. */
export function trengerKopi(S) {
  const s = sisteKopi(S);
  return !s || Date.now() - s.tid > PAAMINN_DAGER * 24 * 3600 * 1000;
}

/** Varsel øverst på Oversikt for kassereren. */
export function kopiVarsel(S) {
  if (!erKasserer(S) || !trengerKopi(S)) return "";
  const s = sisteKopi(S);
  return html`<a class="varsel info lenke" href="#/innstillinger">${raw(ikon("lastned"))} ${s
    ? `Det er over tre måneder siden forrige sikkerhetskopi (${datoTekst(isoDato(s.tid))}). Ta en ny under Innstillinger.`
    : "Det er ikke tatt noen sikkerhetskopi ennå. Ta en under Innstillinger."}</a>`;
}

const isoDato = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// ---------- Kortet under Innstillinger ----------

export function kopiKort(S) {
  const s = sisteKopi(S);
  return html`
    <section class="kort" id="sikkerhetskopi">
      <h2>Sikkerhetskopi</h2>
      <p>${s ? raw(html`Siste sikkerhetskopi: <strong>${datoTekst(isoDato(s.tid))}</strong>${s.navn ? ` av ${s.navn}` : ""}.`) : "Det er ikke tatt noen sikkerhetskopi ennå."}
        ${trengerKopi(S) ? raw(`<span class="status status-sendt">Ta en ny</span>`) : ""}</p>
      <p class="hint">Laster ned alt som er lagret (regnskap, medlemmer, søknader, kvitteringer, møter, referater og regelverk) som én ZIP-fil.
        Ta en kopi minst hvert kvartal, og lagre den et trygt sted klubben har tilgang til, for eksempel i klubbens e-post eller sky.
        Fila inneholder personopplysninger og kontonumre, så ikke del den med andre enn styret og revisor. Slett eldre kopier når du har en ny.</p>
      <div class="knapper venstre">
        <button class="knapp" id="lagKopi">Last ned sikkerhetskopi</button>
        <label class="knapp sekundaer" id="gjenopprettKnapp">Gjenopprett fra sikkerhetskopi …
          <input type="file" id="gjenopprettFil" accept=".zip,application/zip" hidden></label>
      </div>
      <p class="hint" id="kopiStatus" role="status"></p>
    </section>`;
}

export function kobleKopi(main, S) {
  const status = main.querySelector("#kopiStatus");
  const vis = (t) => { if (status) status.textContent = t; };

  main.querySelector("#lagKopi")?.addEventListener("click", (e) => medKnapp(e.currentTarget, async () => {
    try {
      const { filnavn, storrelse } = await lastNedSikkerhetskopi(S, vis);
      vis(`Lastet ned ${filnavn} (${mb(storrelse)}).`);
      melding("Sikkerhetskopien er lastet ned.");
    } catch (err) {
      vis("");
      throw err;
    }
  }));

  const fil = main.querySelector("#gjenopprettFil");
  fil?.addEventListener("change", async () => {
    const valgt = fil.files[0];
    fil.value = "";
    if (!valgt) return;
    await medKnapp(null, async () => {
      try {
        await gjenopprett(valgt, S, vis);
      } finally {
        vis("");
      }
    });
  });
}

const mb = (b) => `${(b / 1024 / 1024).toLocaleString("nb-NO", { maximumFractionDigits: 1 })} MB`;

// ---------- Fra Firestore til JSON og tilbake ----------
// Tidspunkter (f.eks. når en post ble registrert) lagres som { "__tidspunkt": "2026-10-12T16:05:24.000Z" }.

function tilJson(v) {
  if (erTidspunkt(v)) return { __tidspunkt: v.toDate().toISOString() };
  if (Array.isArray(v)) return v.map(tilJson);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, tilJson(x)]));
  return v;
}

function fraJson(v) {
  if (Array.isArray(v)) return v.map(fraJson);
  if (v && typeof v === "object") {
    if (typeof v.__tidspunkt === "string") return tidspunktFra(Date.parse(v.__tidspunkt));
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fraJson(x)]));
  }
  return v;
}

const utenId = ({ id, ...rest }) => rest;

// ---------- Lage sikkerhetskopi ----------

/** Lager sikkerhetskopien, laster den ned og husker når den ble tatt. Brukes også før regnskapet nullstilles. */
export async function lastNedSikkerhetskopi(S, vis) {
  const { blob, filnavn } = await lagSikkerhetskopi(S, vis);
  lastNed(filnavn, blob);
  await merkSikkerhetskopi(S.profil?.navn || "");
  return { filnavn, storrelse: blob.size };
}

async function lagSikkerhetskopi(S, vis) {
  if (!navigator.onLine) throw new Error("Du må være på nett for å ta sikkerhetskopi.");
  const data = {};
  for (const navn of SAMLINGER) {
    vis(`Henter ${NAVN[navn]?.[1] || navn} …`);
    data[navn] = await hentSamling(navn);
  }
  vis("Henter innstillinger …");
  data.innstillinger = (await Promise.all(INNSTILLINGER.map((id) => hentDokument("innstillinger", id)))).filter(Boolean);

  // Filene i regelverket ligger i biter. De settes sammen til hele filer, og JSON-fila peker på fila.
  vis("Henter filene i regelverket …");
  const regelbiter = await hentSamling("regelverkfiler");

  vis("Pakker fila …");
  const innst = medStandard(data.innstillinger.find((d) => d.id === "klubb") || null);
  const poster = nummererBilag(data.poster);
  const filer = [];

  // Kvitteringene blir egne filer med lesbare navn. I JSON-fila erstattes bildet med en henvisning til fila.
  const kvitteringsfil = kvitteringsnavn(data.kvitteringer, poster, data.soknader);
  for (const k of data.kvitteringer) {
    const sti = kvitteringsfil.get(k.id);
    if (typeof k.data === "string" && k.data.startsWith("data:")) {
      filer.push({ navn: sti, data: dataUrlTilBytes(k.data) });
      k.data = { __fil: sti };
    }
  }

  for (const f of regelFiler(data.regelverk, regelbiter)) filer.push(f);

  const laget = new Date();
  const kortnavn = innst.kortnavn || "TPTHK";
  const antall = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length]));
  const manifest = {
    format: FORMAT, versjon: VERSJON, laget: laget.toISOString(), av: normalEpost(S.bruker?.email),
    klubb: innst.klubbnavn, antall,
  };

  filer.unshift(
    { navn: "LESMEG.txt", data: lesmeg(innst, laget, antall) },
    { navn: "manifest.json", data: JSON.stringify(manifest, null, 2) },
    { navn: "regnskap.csv", data: csvTekst(regnskapRader(poster, innst, kvitteringsfil)) },
    { navn: "medlemmer.csv", data: csvTekst(medlemsrader(data.medlemmer)) },
    { navn: "soknader.csv", data: csvTekst(soknadsrader(data.soknader, kvitteringsfil)) },
    { navn: "budsjett.csv", data: csvTekst(budsjettRader(innst)) },
  );
  for (const navn of Object.keys(data)) {
    filer.push({ navn: `data/${navn}.json`, data: JSON.stringify(data[navn].map(tilJson), null, 1) });
  }
  for (const m of moteFiler(data.moter, data.referatutkast, data.signaturer)) filer.push(m);

  return { blob: lagZip(filer), filnavn: `${kortnavn}-sikkerhetskopi-${iDag()}.zip` };
}

/** Setter sammen filene (PDF eller Word) i regelverket. Hvert dokument får fil.__fil med stien i ZIP-fila. */
function regelFiler(regelverk, biter) {
  const ut = [];
  const brukt = new Set();
  for (const r of regelverk) {
    if (!r.fil?.id) continue;
    const deler = biter.filter((b) => b.filId === r.fil.id).sort((a, b) => a.nr - b.nr);
    if (deler.length !== r.fil.deler) continue; // ufullstendig, tas ikke med
    let navn = `regelverk/${rens(r.tittel)}`;
    if (brukt.has(navn)) navn += `-${r.id}`;
    brukt.add(navn);
    navn += `.${String(r.fil.navn).match(/\.(docx?|pdf)$/i)?.[1].toLowerCase() || "pdf"}`;
    ut.push({ navn, data: dataUrlTilBytes(`,${deler.map((d) => d.data).join("")}`) });
    r.fil = { ...r.fil, __fil: navn };
  }
  return ut;
}

function dataUrlTilBytes(dataUrl) {
  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function bytesTilDataUrl(bytes, type) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${type || "application/octet-stream"};base64,${btoa(s)}`;
}

/** Trygge filnavn: bare bokstaver, tall og bindestrek. */
const rens = (s) => String(s || "").normalize("NFC").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "uten-navn";

const filendelse = (k) => (k.type === "application/pdf" ? "pdf" : k.type === "image/png" ? "png" : "jpg");

/** Gir hver kvittering et filnavn: bilag for poster, dato og navn for søknader som ikke er utbetalt ennå. */
function kvitteringsnavn(kvitteringer, poster, soknader) {
  const navn = new Map();
  const brukt = new Set();
  const finnes = new Set(kvitteringer.map((k) => k.id));
  const typer = new Map(kvitteringer.map((k) => [k.id, k]));
  const sett = (id, grunn) => {
    if (navn.has(id) || !finnes.has(id)) return;
    let sti = `${grunn}.${filendelse(typer.get(id))}`;
    if (brukt.has(sti)) sti = `${grunn}-${id}.${filendelse(typer.get(id))}`;
    brukt.add(sti);
    navn.set(id, sti);
  };
  for (const p of poster) {
    (p.kvitteringIds || []).forEach((id, n, alle) =>
      sett(id, `kvitteringer/${aarFor(p)}/bilag-${String(p.bilagsnr).padStart(3, "0")}${alle.length > 1 ? `-${n + 1}` : ""}`));
  }
  for (const s of soknader) {
    (s.kvitteringIds || []).forEach((id, n, alle) =>
      sett(id, `kvitteringer/soknader/${s.dato || "uten-dato"}-${rens(s.navn || s.epost)}${alle.length > 1 ? `-${n + 1}` : ""}`));
  }
  for (const k of kvitteringer) sett(k.id, `kvitteringer/andre/${k.id}`);
  return navn;
}

const typeTekst = { inntekt: "Inntekt", utgift: "Utgift", overforing: "Overføring" };

/** Budsjettet for alle år, én rad per kategori. Selve budsjettet ligger i data/innstillinger.json og gjenopprettes derfra. */
function budsjettRader(innst) {
  const rader = [["År", "Type", "Kategori", "Budsjett"]];
  for (const aar of Object.keys(innst.budsjett || {}).sort()) {
    for (const type of ["inntekt", "utgift"]) {
      for (const b of innst.budsjett[aar]?.[type] || []) rader.push([aar, typeTekst[type], b.kategori, tall(b.belop)]);
    }
  }
  return rader;
}

function regnskapRader(poster, innst, kvitteringsfil) {
  const rader = [["År", "Bilagsnr", "Dato", "Type", "Konto", "Kategori", "Beskrivelse", "Inn", "Ut", "Overført", "Kvitteringer"]];
  for (const p of poster) {
    rader.push([
      aarFor(p), p.bilagsnr, datoTekst(p.dato), typeTekst[p.type] || p.type, kontotekst(p, innst), p.kategori || "", p.beskrivelse || "",
      p.type === "inntekt" ? tall(p.belop) : "", p.type === "utgift" ? tall(p.belop) : "", p.type === "overforing" ? tall(p.belop) : "",
      (p.kvitteringIds || []).map((id) => kvitteringsfil.get(id)).filter(Boolean).join(", "),
    ]);
  }
  return rader;
}

function medlemsrader(medlemmer) {
  const aar = [...new Set(medlemmer.flatMap((m) => Object.keys(m.kontingent || {})))].sort();
  const rader = [["Navn", "E-post", "Telefon", "Aktiv", "Merknad", ...aar.map((a) => `Kontingent ${a}`)]];
  for (const m of [...medlemmer].sort((a, b) => String(a.navn).localeCompare(String(b.navn), "nb"))) {
    rader.push([m.navn, m.epost, m.telefon, m.aktiv === false ? "Nei" : "Ja", m.merknad, ...aar.map((a) => {
      const k = m.kontingent?.[a];
      return k?.betalt ? `Betalt ${datoTekst(k.dato)}${k.belop ? `, ${tall(k.belop)}` : ""}` : "";
    })]);
  }
  return rader;
}

function soknadsrader(soknader, kvitteringsfil) {
  const rader = [["Dato", "Navn", "E-post", "Formål", "Beløp", "Kontonummer", "Status", "Utbetalt", "Kommentar", "Kvitteringer"]];
  for (const s of [...soknader].sort((a, b) => String(a.dato).localeCompare(String(b.dato)))) {
    rader.push([
      datoTekst(s.dato), s.navn, s.epost, s.formaal, tall(s.belop), s.kontonummer, statusTekst[s.status] || s.status,
      datoTekst(s.utbetaltDato), s.kommentar || "", (s.kvitteringIds || []).map((id) => kvitteringsfil.get(id)).filter(Boolean).join(", "),
    ]);
  }
  return rader;
}

const tidTekst = (t) => (erTidspunkt(t) ? t.toDate().toLocaleString("nb-NO", { dateStyle: "short", timeStyle: "short" }) : "");

/** Én tekstfil per møte: innkalling, referat og signaturer. */
function moteFiler(moter, utkast, signaturer) {
  const brukt = new Set();
  return [...moter].sort((a, b) => String(a.dato).localeCompare(String(b.dato))).map((m) => {
    const u = utkast.find((x) => x.id === m.id);
    const sign = signaturer.filter((s) => s.moteId === m.id);
    const linjer = [
      `${moteType[m.type] || "Møte"}${m.tittel ? `: ${m.tittel}` : ""}`,
      `Dato: ${datoTekst(m.dato)}${m.tid ? ` kl. ${m.tid}` : ""}`,
      m.sted ? `Sted: ${m.sted}` : null,
      "",
      "INNKALLING",
      m.innkalling || "(ingen saksliste)",
      "",
    ];
    if (m.referat) {
      linjer.push(m.referatStatus === "godkjent" ? "REFERAT (godkjent)" : "REFERAT (sendt til signering)", m.referat, "");
      linjer.push("SIGNATURER");
      for (const e of m.signatarer || []) {
        const s = sign.find((x) => x.epost === e);
        linjer.push(s ? `${s.navn || e}: signert ${tidTekst(s.tidspunkt)}${s.hash === m.referatHash ? "" : " (signaturen gjelder en annen tekst)"}` : `${m.signatarNavn?.[e] || e}: ikke signert`);
      }
      if (m.referatHash) linjer.push("", `Kontrollsum (SHA-256): ${m.referatHash}`);
    } else if (u?.tekst) {
      linjer.push("REFERAT (utkast, ikke godkjent)", u.tekst);
    }
    let navn = `moter/${m.dato || "uten-dato"}-${rens(m.tittel || moteType[m.type])}`;
    if (brukt.has(navn)) navn += `-${m.id}`;
    brukt.add(navn);
    return { navn: `${navn}.txt`, data: linjer.filter((l) => l !== null).join("\r\n") };
  });
}

function lesmeg(innst, laget, antall) {
  return [
    `Sikkerhetskopi for ${innst.klubbnavn}`,
    `Tatt ${laget.toLocaleString("nb-NO", { dateStyle: "long", timeStyle: "short" })}.`,
    "",
    "Innhold:",
    `  regnskap.csv     Alle poster (${antall.poster}) med bilagsnummer. Åpnes i Excel eller Numbers.`,
    `  medlemmer.csv    Medlemmer (${antall.medlemmer}) og kontingent for alle år.`,
    `  soknader.csv     Søknader om refusjon (${antall.soknader}).`,
    "  budsjett.csv     Budsjettet per år og kategori.",
    `  kvitteringer/    Kvitteringer (${antall.kvitteringer}). Mappene heter etter år, og filene etter bilagsnummeret i regnskap.csv.`,
    "                   Kvitteringer til søknader som ikke er utbetalt ennå, ligger i kvitteringer/soknader.",
    `  moter/           Innkallinger og referater (${antall.moter} møter) som tekst, med hvem som har signert.`,
    `  regelverk/       Vedtekter og andre regler (${antall.regelverk} dokumenter). Filene ligger her, lenker står i data/regelverk.json.`,
    "  data/            Alt i databasen, slik det er lagret. Brukes for å gjenopprette.",
    "",
    "Gjenopprette:",
    "  Logg inn som kasserer, gå til Innstillinger og trykk «Gjenopprett fra sikkerhetskopi».",
    "  Velg denne ZIP-fila. Det som mangler, legges tilbake. Ingenting som finnes, blir endret eller slettet.",
    "",
    "Ikke med:",
    "  Passord. De ligger hos Firebase og kan ikke tas ut. Etter en gjenoppretting til et nytt",
    "  Firebase-prosjekt lager alle ny konto med samme e-post, og får da tilgangen sin tilbake.",
    "",
    "Fila inneholder personopplysninger og kontonumre. Oppbevar den trygt.",
  ].join("\r\n");
}

// ---------- Gjenopprette ----------

async function gjenopprett(fil, S, vis) {
  vis("Leser fila …");
  const filer = await lesZip(fil);
  const lesJson = (navn) => {
    const f = filer.get(navn);
    return f ? JSON.parse(new TextDecoder().decode(f)) : null;
  };
  const manifest = lesJson("manifest.json");
  if (manifest?.format !== FORMAT) throw new Error("Dette er ikke en sikkerhetskopi fra denne nettsiden.");
  if (manifest.versjon > VERSJON) throw new Error("Sikkerhetskopien er laget av en nyere versjon av nettsiden. Last inn siden på nytt og prøv igjen.");

  const kopi = {};
  for (const navn of [...SAMLINGER, "innstillinger"]) kopi[navn] = (lesJson(`data/${navn}.json`) || []).map(fraJson);

  vis("Sjekker hva som mangler …");
  const finnes = {};
  const naa = {};
  for (const navn of ["brukere", "poster", "medlemmer", "soknader", "kvitteringer", "moter", "referatutkast", "regelverk"]) {
    naa[navn] = await hentSamling(navn);
    finnes[navn] = new Set(naa[navn].map((d) => d.id));
  }
  const naaInnst = (await Promise.all(["klubb", "medlemsinfo", "verv", "personer"].map((id) => hentDokument("innstillinger", id)))).filter(Boolean);
  finnes.innstillinger = new Set(naaInnst.map((d) => d.id));

  const mangler = (navn) => kopi[navn].filter((d) => !finnes[navn].has(d.id));
  const plan = {
    innstillinger: kopi.innstillinger.filter((d) => ["klubb", "medlemsinfo", "verv", "personer"].includes(d.id) && !finnes.innstillinger.has(d.id)),
    brukere: mangler("brukere"),
    medlemmer: mangler("medlemmer"),
    kvitteringer: mangler("kvitteringer"),
    soknader: mangler("soknader"),
    poster: mangler("poster"),
    moter: mangler("moter"),
    referatutkast: mangler("referatutkast"),
    regelverk: mangler("regelverk"),
  };
  // Nettsiden lager standardverv av seg selv første gang kassereren logger inn. Er ingen verv delt ut ennå,
  // hentes hvem som har hvilke verv fra kopien.
  const vervNaa = naaInnst.find((d) => d.id === "verv");
  const vervKopi = kopi.innstillinger.find((d) => d.id === "verv");
  const verv = vervNaa && !vervNaa.styre?.length && vervKopi?.styre?.length ? {
    tildelt: vervKopi.tildelt, styre: vervKopi.styre, navn: vervKopi.navn,
    ...(erAdmin(S) || supportAktiv(S) ? { liste: vervKopi.liste } : {}),
  } : null;
  // Budsjett for år som er borte i dag (klubbinnstillingene finnes, men uten budsjettet), legges tilbake år for år.
  const klubbNaa = naaInnst.find((d) => d.id === "klubb");
  const budsjettKopi = kopi.innstillinger.find((d) => d.id === "klubb")?.budsjett || {};
  const budsjettAar = klubbNaa ? Object.keys(budsjettKopi).filter((aar) => !klubbNaa.budsjett?.[aar]).sort() : [];
  // Avstemming og overhoppede banktransaksjoner som er borte (f.eks. etter «Nullstill regnskapet»), legges også tilbake.
  const klubbKopi = kopi.innstillinger.find((d) => d.id === "klubb") || {};
  const avstemmingAar = klubbNaa ? Object.keys(klubbKopi.avstemming || {}).filter((aar) => !klubbNaa.avstemming?.[aar]).sort() : [];
  const hoppet = klubbNaa ? Object.entries(klubbKopi.bankHoppet || {}).filter(([id]) => !klubbNaa.bankHoppet?.[id]) : [];
  const koblinger = koblingerTilPoster(plan.poster, kopi, naa);
  const signerte = plan.moter.filter((m) => m.referatStatus === "signering" || m.referatStatus === "godkjent");
  const totalt = Object.values(plan).reduce((s, l) => s + l.length, 0) + (verv ? 1 : 0) + (budsjettAar.length ? 1 : 0)
    + (avstemmingAar.length ? 1 : 0) + (hoppet.length ? 1 : 0);

  vis("");
  const laget = new Date(manifest.laget).toLocaleString("nb-NO", { dateStyle: "long", timeStyle: "short" });
  if (!totalt) {
    dialog(html`<h2>Ingenting mangler</h2>
      <p>Alt i sikkerhetskopien fra ${laget} finnes allerede. Ingenting er endret.</p>
      <div class="knapper"><button class="knapp" data-lukk>OK</button></div>`);
    return;
  }

  const d = dialog(html`
    <h2>Gjenopprette fra sikkerhetskopi</h2>
    <p>Sikkerhetskopien er fra <strong>${laget}</strong>. Dette mangler i dag og kan legges tilbake:</p>
    <ul>${Object.entries(plan).filter(([, l]) => l.length).map(([navn, l]) => raw(html`<li>${antallTekst(navn, l.length)}</li>`))}
      ${verv ? raw("<li>hvem som har hvilke styreverv</li>") : ""}
      ${budsjettAar.length ? raw(html`<li>budsjettet for ${budsjettAar.join(", ")}</li>`) : ""}
      ${avstemmingAar.length ? raw(html`<li>avstemmingen for ${avstemmingAar.join(", ")}</li>`) : ""}
      ${hoppet.length ? raw(html`<li>${hoppet.length} overhoppede banktransaksjoner</li>`) : ""}</ul>
    ${koblinger.length ? raw(html`<p class="hint">Søknader og kontingent som hører til postene, merkes som utbetalt og betalt igjen.</p>`) : ""}
    ${signerte.length ? raw(html`<p class="hint">${signerte.length} ${signerte.length === 1 ? "referat var" : "referater var"} sendt til signering eller godkjent.
      Signaturer kan ikke legges tilbake, så ${signerte.length === 1 ? "det" : "de"} kommer tilbake som utkast og må signeres på nytt.
      Den signerte teksten med navn og tidspunkt ligger i mappa «moter» i ZIP-fila.</p>`) : ""}
    <p class="hint">Ingenting som finnes i dag, blir slettet.</p>
    <div class="knapper"><button class="knapp sekundaer" data-lukk>Avbryt</button><button class="knapp" id="startGjenoppretting">Legg tilbake</button></div>`);

  d.querySelector("#startGjenoppretting").addEventListener("click", (e) => medKnapp(e.currentTarget, async () => {
    const { forst, etterpaa } = byggSkriving(plan, filer);
    if (verv) etterpaa.push({ samling: "innstillinger", id: "verv", endre: verv });
    if (budsjettAar.length) {
      etterpaa.push({ samling: "innstillinger", id: "klubb", endre: Object.fromEntries(budsjettAar.map((aar) => [`budsjett.${aar}`, budsjettKopi[aar]])) });
    }
    const klubbEndring = {
      ...Object.fromEntries(avstemmingAar.map((aar) => [`avstemming.${aar}`, klubbKopi.avstemming[aar]])),
      ...Object.fromEntries(hoppet.map(([id, v]) => [`bankHoppet.${id}`, v])),
    };
    if (Object.keys(klubbEndring).length) etterpaa.push({ samling: "innstillinger", id: "klubb", endre: klubbEndring });
    etterpaa.push(...koblinger);
    const alle = forst.length + etterpaa.length;
    vis(`Legger tilbake 0 av ${alle} …`);
    await skrivMange(forst, (n) => vis(`Legger tilbake ${n} av ${alle} …`));
    // Møtene må finnes før referatstatusen kan endres, derfor en egen omgang.
    await skrivMange(etterpaa, (n) => vis(`Legger tilbake ${forst.length + n} av ${alle} …`));
    vis("");
    d.close();
    melding("Ferdig. Det som manglet, er lagt tilbake.");
  }));
}

/**
 * Når en post legges tilbake, skal søknaden den kom fra igjen stå som utbetalt, og kontingenten igjen som betalt.
 * (Slettes en post, går søknaden tilbake til «Godkjent» og kontingenten til ubetalt.)
 */
function koblingerTilPoster(poster, kopi, naa) {
  const ut = [];
  const soknadNaa = new Map(naa.soknader.map((s) => [s.id, s]));
  const soknadKopi = new Map(kopi.soknader.map((s) => [s.id, s]));
  const medlemNaa = new Map(naa.medlemmer.map((m) => [m.id, m]));
  const medlemKopi = new Map(kopi.medlemmer.map((m) => [m.id, m]));
  for (const p of poster) {
    const s = soknadNaa.get(p.soknadId);
    const sk = soknadKopi.get(p.soknadId);
    if (s && !s.postId && s.status === "godkjent" && sk?.postId === p.id) {
      ut.push({ samling: "soknader", id: s.id, endre: { status: "utbetalt", postId: p.id, utbetaltDato: sk.utbetaltDato || p.dato } });
    }
    const m = medlemNaa.get(p.medlemId);
    const k = medlemKopi.get(p.medlemId)?.kontingent?.[p.kontingentAar];
    if (m && p.kontingentAar && !m.kontingent?.[p.kontingentAar] && k?.postId === p.id) {
      ut.push({ samling: "medlemmer", id: m.id, endre: { [`kontingent.${p.kontingentAar}`]: k } });
    }
  }
  return ut;
}

/** Gjør planen om til skrivinger, i en rekkefølge som tilgangsreglene godtar. */
function byggSkriving(plan, filer) {
  const ut = [];
  const legg = (samling, d) => ut.push({ samling, id: d.id, data: utenId(d) });

  plan.innstillinger.forEach((d) => legg("innstillinger", d));
  plan.brukere.forEach((d) => legg("brukere", d));
  plan.medlemmer.forEach((d) => legg("medlemmer", d));
  for (const k of plan.kvitteringer) {
    const data = { ...utenId(k) };
    if (data.data?.__fil) {
      const bytes = filer.get(data.data.__fil);
      if (!bytes) continue; // fila er borte fra ZIP-en
      data.data = bytesTilDataUrl(bytes, k.type);
    }
    ut.push({ samling: "kvitteringer", id: k.id, data });
  }
  plan.soknader.forEach((d) => legg("soknader", d));
  plan.poster.forEach((d) => legg("poster", d));

  // Møter kan bare opprettes uten referat. Referatet legges tilbake som utkast etterpå.
  const utkast = new Map(plan.referatutkast.map((u) => [u.id, u]));
  const settStatus = [];
  for (const m of plan.moter) {
    const {
      referat, referatHash, signatarer, signatarNavn, sendtTilSignering, sendtAv, godkjent, referatStatus, ...rest
    } = utenId(m);
    ut.push({ samling: "moter", id: m.id, data: { ...rest, referatStatus: "ingen" } });
    if (referat && !utkast.has(m.id)) utkast.set(m.id, { id: m.id, tekst: referat, signatarer: signatarer || [] });
    if (referatStatus !== "ingen" && (referat || utkast.has(m.id))) settStatus.push(m.id);
  }
  for (const u of utkast.values()) legg("referatutkast", u);

  // Regelverket: fila deles i biter igjen og lagres før dokumentet som peker på den.
  for (const r of plan.regelverk) {
    const { fil, ...rest } = utenId(r);
    const bytes = fil?.__fil ? filer.get(fil.__fil) : null;
    if (bytes) {
      const b64 = bytesTilDataUrl(bytes, "application/pdf").split(",")[1];
      const biter = [];
      for (let i = 0; i < b64.length; i += 900_000) biter.push(b64.slice(i, i + 900_000));
      biter.forEach((data, nr) => ut.push({ samling: "regelverkfiler", id: `${fil.id}__${nr}`, data: { filId: fil.id, nr, data } }));
      const { __fil, ...filInfo } = fil;
      ut.push({ samling: "regelverk", id: r.id, data: { ...rest, fil: { ...filInfo, deler: biter.length } } });
    } else {
      ut.push({ samling: "regelverk", id: r.id, data: rest });
    }
  }
  return { forst: ut, etterpaa: settStatus.map((id) => ({ samling: "moter", id, endre: { referatStatus: "utkast" } })) };
}
