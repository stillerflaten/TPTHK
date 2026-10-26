// Felles for PDF-ene på nettsiden: laster jsPDF ved behov, og tegner toppen med klubbens logo og bunnteksten,
// så alle PDF-ene ser like ut. PDF-biblioteket (jsPDF) ligger i public/vendor og lastes først når noen trenger det.

import { datoTekst } from "./util.js";

let bibliotek = null;
export function hentJsPdf() {
  bibliotek ??= new Promise((ok, feil) => {
    if (window.jspdf) return ok(window.jspdf.jsPDF);
    const s = Object.assign(document.createElement("script"), { src: "vendor/jspdf.umd.min.js" });
    s.onload = () => ok(window.jspdf.jsPDF);
    s.onerror = () => { bibliotek = null; feil(new Error("Klarte ikke å laste PDF-verktøyet. Sjekk nettet og prøv igjen.")); };
    document.head.append(s);
  });
  return bibliotek;
}

// pdf-lib trengs bare når kvitteringer som er PDF skal settes inn i en annen PDF (jsPDF kan ikke lese PDF-er).
let pdfLib = null;
export function hentPdfLib() {
  pdfLib ??= new Promise((ok, feil) => {
    if (window.PDFLib) return ok(window.PDFLib);
    const s = Object.assign(document.createElement("script"), { src: "vendor/pdf-lib.min.js" });
    s.onload = () => ok(window.PDFLib);
    s.onerror = () => { pdfLib = null; feil(new Error("Klarte ikke å laste PDF-verktøyet. Sjekk nettet og prøv igjen.")); };
    document.head.append(s);
  });
  return pdfLib;
}

/** Tegner et bilde (f.eks. logoen i SVG) om til JPEG som kan legges i PDF-en. */
const bilder = {};
export function hentBilde(src, bredde, hoyde) {
  bilder[src] ??= new Promise((ok) => {
    const img = new Image();
    img.onload = () => {
      const c = Object.assign(document.createElement("canvas"), { width: bredde, height: hoyde });
      const g = c.getContext("2d");
      g.fillStyle = "#fff"; // JPEG har ikke gjennomsiktighet, og hvit bakgrunn gir en liten fil.
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      ok(c.toDataURL("image/jpeg", 0.9));
    };
    img.onerror = () => ok(null); // Uten logo heller enn ingen PDF.
    img.src = src;
  });
  return bilder[src];
}

// Standardskriften i PDF støtter æ, ø, å og vanlige tegn, men ikke emoji o.l. De byttes ut så teksten ikke blir uleselig.
export const rens = (t) => String(t ?? "")
  .replace(/[‘’]/g, "'").replace(/[“”]/g, "\"")
  .replace(/[^\n\t\x20-\x7E -ÿ–—•…€]/gu, "");

/** Henter jsPDF og logoen og lager et tomt A4-dokument. */
export async function nyPdf() {
  const [JsPDF, logo] = await Promise.all([hentJsPdf(), hentBilde("icons/logo.svg", 480, 478)]);
  return { doc: new JsPDF({ unit: "mm", format: "a4" }), logo };
}

export const A4 = { B: 210, H: 297, marg: 22 };

/** Toppen: logo, klubbnavn og utskriftsdato, med en strek under. Gir y-posisjonen under streken. */
export function tegnTopp(doc, logo, klubbnavn) {
  const { B, marg } = A4;
  let y = 18;
  if (logo) doc.addImage(logo, "JPEG", marg, y, 24, 24);
  doc.setFont("helvetica", "bold").setFontSize(14).setTextColor(20);
  doc.text(rens(klubbnavn), logo ? marg + 30 : marg, y + 11);
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(100);
  doc.text(`Utskrevet ${datoTekst(new Date().toISOString().slice(0, 10))}`, logo ? marg + 30 : marg, y + 17);
  y += 30;
  doc.setDrawColor(200).setLineWidth(0.4).line(marg, y, B - marg, y);
  return y;
}

/** Felt med navn til venstre og verdi til høyre (emne, tid, sted). Gir y-posisjonen under siste felt. */
export function tegnFelt(doc, y, felt) {
  const { B, marg } = A4, bredde = B - marg * 2;
  doc.setFontSize(12);
  for (const [navn, verdi] of felt) {
    const linjer = doc.splitTextToSize(rens(verdi), bredde - 28);
    y += 8;
    doc.setFont("helvetica", "bold").setTextColor(90).text(navn, marg, y);
    doc.setFont("helvetica", "normal").setTextColor(20).text(linjer, marg + 28, y);
    y += (linjer.length - 1) * 5.5;
  }
  return y;
}

/** Mellomtittel med strek under. Gir y-posisjonen der teksten under skal starte. */
export function tegnMellomtittel(doc, y, tittel) {
  const { B, marg } = A4;
  doc.setFont("helvetica", "bold").setFontSize(15).setTextColor(20).text(tittel, marg, y);
  y += 3;
  doc.setDrawColor(200).line(marg, y, B - marg, y);
  return y + 8;
}

/** Lang tekst over så mange sider som trengs, avsnitt for avsnitt. Gir y-posisjonen under teksten. */
export function tegnTekst(doc, y, tekst) {
  const { B, H, marg } = A4, bredde = B - marg * 2;
  doc.setFont("helvetica", "normal").setFontSize(11.5).setTextColor(20);
  const linjehoyde = 5.6, bunn = H - 24;
  for (const avsnitt of rens(tekst).split("\n")) {
    const linjer = avsnitt.trim() ? doc.splitTextToSize(avsnitt, bredde) : [""];
    for (const linje of linjer) {
      if (y > bunn) { doc.addPage(); y = 24; }
      doc.text(linje, marg, y);
      y += linjehoyde;
    }
  }
  return y;
}

/** Bunnteksten på hver side: valgfri lenketekst til venstre og sidetall til høyre. */
export function tegnBunn(doc, lenke) {
  const { B, H, marg } = A4;
  const sider = doc.getNumberOfPages();
  for (let i = 1; i <= sider; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(120);
    if (lenke) doc.textWithLink(lenke.tekst, marg, H - 12, { url: lenke.url });
    doc.text(`Side ${i} av ${sider}`, B - marg, H - 12, { align: "right" });
  }
}
