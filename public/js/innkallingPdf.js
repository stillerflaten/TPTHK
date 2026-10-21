// Lager innkallingen til et møte som PDF med klubbens logo: emne, tid, sted og saksliste.
// PDF-biblioteket (jsPDF) ligger i public/vendor og lastes først når noen trenger det, så resten av siden ikke blir tregere.

import { datoTekst } from "./util.js";

let bibliotek = null;
function hentJsPdf() {
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
function hentBilde(src, bredde, hoyde) {
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
const rens = (t) => String(t ?? "")
  .replace(/[‘’]/g, "'").replace(/[“”]/g, "\"")
  .replace(/[^\n\t\x20-\x7E -ÿ–—•…€]/gu, "");

/**
 * Lager PDF-en.
 * @param m møtet ({ type, tittel, dato, tid, sted, innkalling, id })
 * @param valg { klubbnavn, typeTekst, aapent, lenke }
 * @returns { blob, filnavn }
 */
export async function lagInnkallingPdf(m, valg) {
  const [JsPDF, logoBilde, leverandor] = await Promise.all([
    hentJsPdf(), hentBilde("icons/logo.svg", 480, 478), hentBilde("icons/tillerflaten-digital.png", 96, 96),
  ]);
  const doc = new JsPDF({ unit: "mm", format: "a4" });
  const B = 210, H = 297, marg = 22, bredde = B - marg * 2;
  const type = valg.typeTekst.toLowerCase();
  doc.setProperties({ title: `Innkalling til ${type}`, subject: rens(m.tittel || ""), author: rens(valg.klubbnavn), creator: "TPTHK" });

  // Topp: logo og klubbnavn
  let y = 18;
  if (logoBilde) doc.addImage(logoBilde, "JPEG", marg, y, 24, 24);
  doc.setFont("helvetica", "bold").setFontSize(14).setTextColor(20);
  doc.text(rens(valg.klubbnavn), logoBilde ? marg + 30 : marg, y + 11);
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(100);
  doc.text(`Utskrevet ${datoTekst(new Date().toISOString().slice(0, 10))}`, logoBilde ? marg + 30 : marg, y + 17);
  y += 30;
  doc.setDrawColor(200).setLineWidth(0.4).line(marg, y, B - marg, y);

  // Overskrift
  y += 14;
  doc.setFont("helvetica", "bold").setFontSize(22).setTextColor(20);
  doc.text(`Innkalling til ${type}`, marg, y);
  y += 6;

  // Emne, tid, sted
  const felt = [
    ["Emne", m.tittel || valg.typeTekst],
    ["Tid", `${datoTekst(m.dato)}${m.tid ? ` kl. ${m.tid}` : ""}`],
    ["Sted", m.sted || "Ikke oppgitt"],
  ];
  if (valg.aapent) felt.push(["Hvem", "Åpent for alle medlemmer"]);
  doc.setFontSize(12);
  for (const [navn, verdi] of felt) {
    const linjer = doc.splitTextToSize(rens(verdi), bredde - 28);
    y += 8;
    doc.setFont("helvetica", "bold").setTextColor(90).text(navn, marg, y);
    doc.setFont("helvetica", "normal").setTextColor(20).text(linjer, marg + 28, y);
    y += (linjer.length - 1) * 5.5;
  }

  // Saksliste
  y += 14;
  doc.setFont("helvetica", "bold").setFontSize(15).setTextColor(20).text("Saksliste", marg, y);
  y += 3;
  doc.setDrawColor(200).line(marg, y, B - marg, y);
  y += 8;
  doc.setFont("helvetica", "normal").setFontSize(11.5).setTextColor(20);
  const linjehoyde = 5.6, bunn = H - 24;
  const tekst = rens(m.innkalling?.trim() || "Ingen saksliste er lagt inn.");
  for (const avsnitt of tekst.split("\n")) {
    const linjer = avsnitt.trim() ? doc.splitTextToSize(avsnitt, bredde) : [""];
    for (const linje of linjer) {
      if (y > bunn) { doc.addPage(); y = 24; }
      doc.text(linje, marg, y);
      y += linjehoyde;
    }
  }

  // Bunntekst på hver side
  const sider = doc.getNumberOfPages();
  for (let i = 1; i <= sider; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(120);
    if (valg.lenke) doc.textWithLink("Innkallingen ligger også på nettsiden, der du logger inn.", marg, H - 12, { url: valg.lenke });
    doc.text(`Side ${i} av ${sider}`, B - marg, H - 12, { align: "right" });
    const levert = "Levert av Silje Langtind Tillerflaten";
    const x = (B - doc.getTextWidth(levert) - (leverandor ? 5 : 0)) / 2;
    if (leverandor) doc.addImage(leverandor, "JPEG", x, H - 8.6, 3.6, 3.6);
    doc.text(levert, x + (leverandor ? 5 : 0), H - 5.8);
  }

  const filnavn = `Innkalling ${type} ${m.dato}.pdf`;
  return { blob: doc.output("blob"), filnavn };
}
