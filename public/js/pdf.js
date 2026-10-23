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

/** Henter jsPDF, logoen og leverandørikonet og lager et tomt A4-dokument. */
export async function nyPdf() {
  const [JsPDF, logo, leverandor] = await Promise.all([
    hentJsPdf(), hentBilde("icons/logo.svg", 480, 478), hentBilde("icons/tillerflaten-digital.png", 96, 96),
  ]);
  return { doc: new JsPDF({ unit: "mm", format: "a4" }), logo, leverandor };
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

/** Bunnteksten på hver side: valgfri lenketekst til venstre, sidetall til høyre og «Levert av» i midten. */
export function tegnBunn(doc, leverandor, lenke) {
  const { B, H, marg } = A4;
  const sider = doc.getNumberOfPages();
  for (let i = 1; i <= sider; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(120);
    if (lenke) doc.textWithLink(lenke.tekst, marg, H - 12, { url: lenke.url });
    doc.text(`Side ${i} av ${sider}`, B - marg, H - 12, { align: "right" });
    const levert = "Levert av Silje Langtind Tillerflaten";
    const x = (B - doc.getTextWidth(levert) - (leverandor ? 5 : 0)) / 2;
    if (leverandor) doc.addImage(leverandor, "JPEG", x, H - 8.6, 3.6, 3.6);
    doc.text(levert, x + (leverandor ? 5 : 0), H - 5.8);
  }
}
