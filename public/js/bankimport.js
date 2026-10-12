// Leser kontoutskrifter eksportert fra nettbanken (CSV eller Excel) og finner ut hvilke transaksjoner som alt er ført.
// Laget for Nordea, men kjenner også igjen vanlige kolonnenavn fra andre norske banker.
// Ingen Firebase her, bare filer og tall.

import { lesZip } from "./zip.js";
import { endring } from "./regnskap.js";

// ---------- Lese fila ----------

/** Leser en CSV- eller Excel-fil og gir tilbake radene som lister med celler. */
export async function lesFil(fil) {
  const navn = fil.name.toLowerCase();
  const bytes = new Uint8Array(await fil.arrayBuffer());
  if (navn.endsWith(".xls")) {
    throw new Error("Gamle Excel-filer (.xls) kan ikke leses. Åpne fila i Excel og lagre den som .xlsx, eller last ned kontoutskriften som CSV.");
  }
  // .xlsx er en ZIP-fil (begynner med «PK»).
  if (navn.endsWith(".xlsx") || (bytes[0] === 0x50 && bytes[1] === 0x4b)) return lesXlsx(fil);
  return lesCsv(dekodTekst(bytes));
}

/** Nettbanker lagrer enten som UTF-8 eller som eldre Windows-tegnsett. Prøver UTF-8 først, så æøå blir riktig uansett. */
function dekodTekst(bytes) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** CSV med semikolon, komma eller tabulator. Tegnet som brukes mest på første linje, vinner. */
export function lesCsv(tekst) {
  const forste = tekst.split(/\r?\n/).find((l) => l.trim()) || "";
  const skille = [";", "\t", ","].map((t) => [t, forste.split(t).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rader = [];
  let rad = [];
  let celle = "";
  let iSitat = false;
  for (let i = 0; i < tekst.length; i++) {
    const t = tekst[i];
    if (iSitat) {
      if (t === '"' && tekst[i + 1] === '"') { celle += '"'; i++; }
      else if (t === '"') iSitat = false;
      else celle += t;
    } else if (t === '"' && celle === "") iSitat = true;
    else if (t === skille) { rad.push(celle); celle = ""; }
    else if (t === "\n" || t === "\r") {
      if (t === "\r" && tekst[i + 1] === "\n") i++;
      rad.push(celle); rader.push(rad); rad = []; celle = "";
    } else celle += t;
  }
  if (celle || rad.length) { rad.push(celle); rader.push(rad); }
  return rader.filter((r) => r.some((c) => String(c).trim()));
}

/** Første ark i en .xlsx-fil. Tall blir tall, tekst blir tekst. */
async function lesXlsx(fil) {
  const filer = await lesZip(fil);
  const xml = (navn) => {
    const data = filer.get(navn);
    return data ? new DOMParser().parseFromString(new TextDecoder().decode(data), "application/xml") : null;
  };
  const ark = [...filer.keys()].filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))[0];
  if (!ark) throw new Error("Fant ingen ark i Excel-fila.");
  const delte = [...(xml("xl/sharedStrings.xml")?.getElementsByTagName("si") || [])].map((si) => si.textContent);
  const rader = [];
  for (const r of xml(ark).getElementsByTagName("row")) {
    const rad = [];
    for (const c of r.getElementsByTagName("c")) {
      const kol = kolonneIndeks(c.getAttribute("r")) ?? rad.length;
      const type = c.getAttribute("t");
      const v = c.getElementsByTagName("v")[0]?.textContent ?? "";
      let verdi;
      if (type === "s") verdi = delte[Number(v)] ?? "";
      else if (type === "inlineStr") verdi = c.getElementsByTagName("is")[0]?.textContent ?? "";
      else if (type === "str" || type === "b" || type === "e" || type === "d") verdi = v;
      else verdi = v === "" ? "" : Number(v);
      while (rad.length < kol) rad.push("");
      rad[kol] = verdi;
    }
    if (rad.some((c) => String(c).trim())) rader.push(rad);
  }
  return rader;
}

/** «C12» → 2 */
function kolonneIndeks(ref) {
  const bokstaver = String(ref || "").match(/^[A-Z]+/)?.[0];
  if (!bokstaver) return null;
  return [...bokstaver].reduce((s, b) => s * 26 + b.charCodeAt(0) - 64, 0) - 1;
}

// ---------- Kolonner ----------

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-zæøåäö]/g, "");

// Kjente kolonnenavn, det beste først. Nordea bruker «Bokføringsdato», «Beløp», «Tittel» og «Navn».
const KJENTE = {
  dato: ["bokføringsdato", "bokføringsdag", "bokført", "bokførtdato", "bokføringsdatum", "bokföringsdag", "transaksjonsdato", "dato", "date", "bookingdate", "rentedato", "valuteringsdato"],
  belop: ["beløp", "belop", "belopp", "amount", "beløpinok", "beløpnok", "transaksjonsbeløp"],
  inn: ["innpåkonto", "inn", "innskudd", "kredit", "kreditt", "credit"],
  ut: ["utfrakonto", "utavkonto", "ut", "uttak", "debet", "debit"],
  tekst: ["tittel", "tekst", "beskrivelse", "forklaring", "transaksjonstekst", "rubrik", "description", "text", "melding", "navn", "mottakernavn", "betalingsmottaker", "name"],
  ref: ["arkivreferanse", "arkivref", "referanse", "reference", "transaksjonsid"],
};

/** Finner raden med kolonneoverskrifter og hvilke kolonner som er dato, beløp og tekst. Gir null hvis den ikke finner dem. */
export function finnKolonner(rader) {
  for (let i = 0; i < Math.min(rader.length, 20); i++) {
    const navn = rader[i].map(norm);
    const finn = (liste, opptatt = []) => {
      for (const n of liste) {
        const k = navn.findIndex((x, j) => x === n && !opptatt.includes(j));
        if (k >= 0) return k;
      }
      return -1;
    };
    const dato = finn(KJENTE.dato);
    if (dato < 0) continue;
    const belop = finn(KJENTE.belop);
    const inn = belop < 0 ? finn(KJENTE.inn) : -1;
    const ut = belop < 0 ? finn(KJENTE.ut) : -1;
    if (belop < 0 && (inn < 0 || ut < 0)) continue;
    // Tekst: alle tekstkolonner vi kjenner, i fast rekkefølge (f.eks. «Tittel» og så «Navn»).
    const tekst = [];
    for (const n of KJENTE.tekst) {
      const k = navn.indexOf(n);
      if (k >= 0 && !tekst.includes(k)) tekst.push(k);
    }
    return { overskrift: i, dato, belop, inn, ut, tekst, ref: finn(KJENTE.ref) };
  }
  return null;
}

// ---------- Verdier ----------

/** Dato fra banken som «ÅÅÅÅ-MM-DD». Tåler 2026/10/12, 2026-10-12, 12.10.2026, 12.10.26 og Excel-tall. Gir null for f.eks. «Reservert». */
export function tolkDato(v) {
  if (typeof v === "number") {
    if (v < 20000 || v > 80000) return null;
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return gyldig(m[1], m[2], m[3]);
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})\b/);
  if (m) return gyldig(m[3].length === 2 ? `20${m[3]}` : m[3], m[2], m[1]);
  return null;
}

function gyldig(a, m, d) {
  const iso = `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const dato = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(dato.getTime()) && dato.toISOString().slice(0, 10) === iso ? iso : null;
}

/** Beløp i øre med fortegn. Tåler «-1 234,50», «−1.234,50», «1234.5», «kr 50» og tall fra Excel. */
export function tolkBankbelop(v) {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) : null;
  let s = String(v ?? "").replace(/[\s  ']/g, "").replace(/kr|nok/gi, "").replace(/−/g, "-");
  if (!s) return null;
  let minus = false;
  if (/^\(.*\)$/.test(s)) { minus = true; s = s.slice(1, -1); }
  if (s.endsWith("-")) { minus = true; s = s.slice(0, -1); }
  if (s.startsWith("+")) s = s.slice(1);
  if (s.startsWith("-")) { minus = !minus; s = s.slice(1); }
  if (s.includes(",") && s.includes(".")) {
    // Det siste skilletegnet er desimaltegnet.
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (s.includes(",")) s = s.replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const oere = Math.round(parseFloat(s) * 100);
  return minus ? -oere : oere;
}

// ---------- Transaksjoner ----------

/**
 * Gjør radene om til transaksjoner: { id, dato, belop (øre, minus = ut av kontoen), tekst }.
 * Rader uten gyldig dato (f.eks. reserverte beløp) eller uten beløp telles, men tas ikke med.
 * id er lik hver gang samme transaksjon leses inn, så den kjennes igjen neste gang.
 */
export async function lagTransaksjoner(rader, kol, konto) {
  const ut = [];
  let hoppetOver = 0;
  const sett = new Map();
  for (const rad of rader.slice(kol.overskrift + 1)) {
    const dato = tolkDato(rad[kol.dato]);
    let belop;
    if (kol.belop >= 0) belop = tolkBankbelop(rad[kol.belop]);
    else {
      const inn = tolkBankbelop(rad[kol.inn]) || 0;
      const ut_ = tolkBankbelop(rad[kol.ut]) || 0;
      belop = Math.abs(inn) - Math.abs(ut_);
    }
    if (!dato || !belop) { hoppetOver++; continue; }
    const deler = [];
    for (const k of kol.tekst) {
      const t = String(rad[k] ?? "").replace(/\s+/g, " ").trim();
      if (t && !deler.some((d) => d.toLowerCase().includes(t.toLowerCase()))) deler.push(t);
    }
    const tekst = deler.join(" · ");
    const ref = kol.ref >= 0 ? String(rad[kol.ref] ?? "").trim() : "";
    // To like transaksjoner samme dag (f.eks. to kaffekjøp) skilles med et løpenummer.
    const nokkel = ref || `${dato}|${belop}|${tekst.toLowerCase()}`;
    const nr = (sett.get(nokkel) || 0) + 1;
    sett.set(nokkel, nr);
    ut.push({ id: await kortHash(`${konto}|${nokkel}|${nr}`), dato, belop, tekst });
  }
  ut.sort((a, b) => b.dato.localeCompare(a.dato));
  return { transaksjoner: ut, hoppetOver };
}

async function kortHash(tekst) {
  const sum = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(tekst));
  return [...new Uint8Array(sum).slice(0, 10)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const dagerMellom = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;

/**
 * Finner ut hva som er gjort med hver transaksjon:
 *  - «fort»: en post er ført herfra. Posten husker transaksjonen i «bank» (konto → id), så en overføring kan kjennes igjen på begge kontoene.
 *  - «hoppet»: kassereren har valgt å hoppe over den.
 *  - «kanskje»: en post på samme konto har samme beløp og nesten samme dato. Den er trolig ført for hånd.
 *  - «ny»: ikke ført.
 * Hver post kan bare passe til én transaksjon.
 */
export function vurder(transaksjoner, poster, innst, konto, hoppet = {}) {
  const fraBank = new Map(poster.filter((p) => p.bank?.[konto]).map((p) => [p.bank[konto], p]));
  const brukt = new Set();
  const status = new Map();
  for (const t of transaksjoner) {
    const p = fraBank.get(t.id);
    if (p) { status.set(t.id, { status: "fort", post: p }); brukt.add(p.id); }
    else if (hoppet[t.id]) status.set(t.id, { status: "hoppet" });
  }
  // Nærmeste dato først, så posten havner på riktig transaksjon når det er flere med samme beløp.
  const kandidater = [];
  for (const t of transaksjoner) {
    if (status.has(t.id)) continue;
    for (const p of poster) {
      if (brukt.has(p.id) || endring(p, innst, konto) !== t.belop) continue;
      const dager = dagerMellom(p.dato, t.dato);
      if (dager <= 7) kandidater.push({ t, p, dager });
    }
  }
  kandidater.sort((a, b) => a.dager - b.dager);
  for (const { t, p } of kandidater) {
    if (status.has(t.id) || brukt.has(p.id)) continue;
    // En post som alt er koblet til en annen transaksjon på denne kontoen, hører til den.
    if (p.bank?.[konto]) continue;
    status.set(t.id, { status: "kanskje", post: p });
    brukt.add(p.id);
  }
  for (const t of transaksjoner) if (!status.has(t.id)) status.set(t.id, { status: "ny" });
  return status;
}
