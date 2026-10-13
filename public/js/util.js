// Små hjelpefunksjoner som brukes rundt om i appen.

/** Gjør tekst trygg å sette inn i HTML. Brukes på alt brukerne skriver. */
export function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

/** Template-tag som escaper alle verdier, unntatt de som er merket med raw(). */
export function html(strings, ...verdier) {
  return strings.reduce((ut, s, i) => {
    if (i === 0) return s;
    const v = verdier[i - 1];
    const tekst = Array.isArray(v) ? v.map(tilTekst).join("") : tilTekst(v);
    return ut + tekst + s;
  }, "");
}
const tilTekst = (v) => (v && v.__raw !== undefined ? v.__raw : (v === false || v == null ? "" : esc(v)));
export const raw = (s) => ({ __raw: String(s) });

// ---------- Beløp ----------
// Alle beløp lagres som heltall i øre for å unngå avrundingsfeil (0,1 + 0,2 ≠ 0,3 i datamaskiner).

const kroneFormat = new Intl.NumberFormat("nb-NO", { style: "currency", currency: "NOK" });
const tallFormat = new Intl.NumberFormat("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const kr = (oere) => kroneFormat.format((oere || 0) / 100);
export const tall = (oere) => tallFormat.format((oere || 0) / 100);

/** Tolker «1 234,50», «1234.5» og «1234» til øre. Gir null hvis det ikke er et gyldig beløp. */
export function tolkBelop(tekst) {
  let s = String(tekst ?? "").replace(/[\s ]/g, "").replace(/kr/i, "");
  if (!s) return null;
  // Hvis både punktum og komma er brukt, er punktum tusenskille.
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "");
  s = s.replace(",", ".");
  if (!/^-?\d+(\.\d{0,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}

/** Viser øre som tekst egnet for et input-felt («1234,50»). */
export const belopTilInput = (oere) => (oere == null ? "" : (oere / 100).toFixed(2).replace(".", ",").replace(/,00$/, ""));

// ---------- Datoer ----------
// Datoer lagres som tekst «ÅÅÅÅ-MM-DD». Det sorterer riktig og unngår tidssone-trøbbel.

export function iDag() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export const aarNaa = () => new Date().getFullYear();

export function datoTekst(iso) {
  if (!iso) return "";
  const [a, m, d] = iso.split("-");
  return `${d}.${m}.${a}`;
}

// ---------- Eksport ----------

/** Lager en CSV-fil som Excel på norsk åpner riktig (semikolon og BOM for æøå). */
export function lastNedCsv(filnavn, rader) {
  lastNed(filnavn, new Blob([csvTekst(rader)], { type: "text/csv;charset=utf-8" }));
}

export function csvTekst(rader) {
  const celle = (v) => {
    const s = String(v ?? "");
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "\uFEFF" + rader.map((r) => r.map(celle).join(";")).join("\r\n");
}

export function lastNed(filnavn, blob) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filnavn });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- Kvitteringer ----------

const MAKS_BYTES = 900_000; // Firestore tåler 1 MB per dokument, vi holder god margin.

/**
 * Gjør om en fil til noe vi kan lagre: bilder krympes og komprimeres til JPEG,
 * PDF-er lagres som de er (hvis de er små nok).
 */
export async function forberedKvittering(fil) {
  if (fil.type === "application/pdf") {
    const data = await lesSomDataUrl(fil);
    if (data.length > MAKS_BYTES) throw new Error("PDF-en er for stor (maks ca. 650 kB). Ta heller et bilde av kvitteringen.");
    return { navn: fil.name, type: fil.type, data };
  }
  if (!fil.type.startsWith("image/")) throw new Error("Kvitteringen må være et bilde eller en PDF.");

  const bilde = await lastBilde(fil);
  // Prøv gradvis mindre størrelse og kvalitet til bildet er lite nok.
  for (const [maks, kvalitet] of [[1800, 0.8], [1500, 0.7], [1200, 0.65], [1000, 0.6], [800, 0.55]]) {
    const skala = Math.min(1, maks / Math.max(bilde.width, bilde.height));
    const canvas = Object.assign(document.createElement("canvas"), {
      width: Math.round(bilde.width * skala), height: Math.round(bilde.height * skala),
    });
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bilde, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/jpeg", kvalitet);
    if (data.length <= MAKS_BYTES) {
      return { navn: fil.name.replace(/\.[^.]+$/, "") + ".jpg", type: "image/jpeg", data };
    }
  }
  throw new Error("Klarte ikke å gjøre bildet lite nok. Prøv et annet bilde.");
}

export function lesSomDataUrl(fil) {
  return new Promise((ok, feil) => {
    const r = new FileReader();
    r.onload = () => ok(r.result);
    r.onerror = () => feil(r.error);
    r.readAsDataURL(fil);
  });
}

async function lastBilde(fil) {
  // createImageBitmap snur bildet riktig vei etter EXIF (viktig for mobilbilder).
  if ("createImageBitmap" in window) {
    try { return await createImageBitmap(fil, { imageOrientation: "from-image" }); } catch { /* prøv neste */ }
  }
  const url = URL.createObjectURL(fil);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } catch {
    throw new Error("Klarte ikke å lese bildet. Hvis det er tatt med iPhone (HEIC), prøv å ta bildet direkte fra appen.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Gjør en data-URL om til en fil. Med «fastType» brukes den typen, uansett hva data-URL-en sier. */
export function dataUrlTilBlob(dataUrl, fastType) {
  const [hode, b64] = dataUrl.split(",");
  const type = fastType || hode.match(/data:(.*?);/)[1];
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type });
}
