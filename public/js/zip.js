// Lager og leser ZIP-filer, uten ekstra biblioteker.
// Filene lagres ukomprimert (kvitteringene er allerede komprimerte bilder), så koden kan være liten.
// Ved lesing støttes også komprimerte filer, i tilfelle noen har pakket ut og pakket inn igjen på Mac eller PC.

const tekst = new TextEncoder();

const CRC_TABELL = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABELL[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Dato og klokkeslett i formatet ZIP bruker (lokal tid). */
function dosTid(d) {
  return {
    tid: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    dato: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/**
 * Lager en ZIP-fil.
 * @param {{navn: string, data: string|Uint8Array}[]} filer
 * @returns {Blob}
 */
export function lagZip(filer) {
  const { tid, dato } = dosTid(new Date());
  const deler = [];
  const katalog = [];
  let pos = 0;

  for (const fil of filer) {
    const navn = tekst.encode(fil.navn);
    const data = typeof fil.data === "string" ? tekst.encode(fil.data) : fil.data;
    const crc = crc32(data);

    const lokal = new DataView(new ArrayBuffer(30));
    lokal.setUint32(0, 0x04034b50, true);
    lokal.setUint16(4, 20, true);
    lokal.setUint16(6, 0x0800, true); // filnavn i UTF-8 (æøå)
    lokal.setUint16(8, 0, true); // ukomprimert
    lokal.setUint16(10, tid, true);
    lokal.setUint16(12, dato, true);
    lokal.setUint32(14, crc, true);
    lokal.setUint32(18, data.length, true);
    lokal.setUint32(22, data.length, true);
    lokal.setUint16(26, navn.length, true);
    lokal.setUint16(28, 0, true);
    deler.push(lokal, navn, data);

    const sentral = new DataView(new ArrayBuffer(46));
    sentral.setUint32(0, 0x02014b50, true);
    sentral.setUint16(4, 20, true);
    sentral.setUint16(6, 20, true);
    sentral.setUint16(8, 0x0800, true);
    sentral.setUint16(10, 0, true);
    sentral.setUint16(12, tid, true);
    sentral.setUint16(14, dato, true);
    sentral.setUint32(16, crc, true);
    sentral.setUint32(20, data.length, true);
    sentral.setUint32(24, data.length, true);
    sentral.setUint16(28, navn.length, true);
    sentral.setUint32(42, pos, true);
    katalog.push(sentral, navn);

    pos += 30 + navn.length + data.length;
  }

  const katalogStr = katalog.reduce((s, d) => s + d.byteLength, 0);
  const slutt = new DataView(new ArrayBuffer(22));
  slutt.setUint32(0, 0x06054b50, true);
  slutt.setUint16(8, filer.length, true);
  slutt.setUint16(10, filer.length, true);
  slutt.setUint32(12, katalogStr, true);
  slutt.setUint32(16, pos, true);

  return new Blob([...deler, ...katalog, slutt], { type: "application/zip" });
}

/**
 * Leser en ZIP-fil.
 * @param {Blob} blob
 * @returns {Promise<Map<string, Uint8Array>>} filnavn → innhold
 */
export async function lesZip(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const v = new DataView(buf.buffer);

  // Slutten av fila peker på innholdsfortegnelsen. Den ligger de siste 22 bytene (pluss en eventuell kommentar).
  let slutt = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { slutt = i; break; }
  }
  if (slutt < 0) throw new Error("Fila er ikke en ZIP-fil.");

  const antall = v.getUint16(slutt + 10, true);
  let p = v.getUint32(slutt + 16, true);
  const dekod = new TextDecoder();
  const filer = new Map();

  for (let n = 0; n < antall; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error("ZIP-fila er skadet.");
    const metode = v.getUint16(p + 10, true);
    const komprimert = v.getUint32(p + 20, true);
    const navnLengde = v.getUint16(p + 28, true);
    const ekstra = v.getUint16(p + 30, true);
    const kommentar = v.getUint16(p + 32, true);
    const lokal = v.getUint32(p + 42, true);
    const navn = dekod.decode(buf.subarray(p + 46, p + 46 + navnLengde));
    p += 46 + navnLengde + ekstra + kommentar;

    if (navn.endsWith("/")) continue; // mappe
    const start = lokal + 30 + v.getUint16(lokal + 26, true) + v.getUint16(lokal + 28, true);
    const data = buf.subarray(start, start + komprimert);
    if (metode === 0) filer.set(navn, data);
    else if (metode === 8) filer.set(navn, await pakkUt(data));
    // Andre komprimeringer brukes nesten aldri, og hoppes over.
  }
  return filer;
}

async function pakkUt(data) {
  if (!("DecompressionStream" in window)) throw new Error("Nettleseren er for gammel til å lese denne ZIP-fila. Oppdater den, eller bruk fila slik den ble lastet ned.");
  const strom = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(strom).arrayBuffer());
}
