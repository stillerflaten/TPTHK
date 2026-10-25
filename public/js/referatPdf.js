// Lager et godkjent møtereferat som PDF med klubbens logo: møtet, referatteksten og hvem som har signert når.
// Felles topp, bunn og lasting av PDF-biblioteket ligger i pdf.js.

import { datoTekst } from "./util.js";
import { nyPdf, rens, tegnTopp, tegnBunn, tegnFelt, tegnMellomtittel, tegnTekst, A4 } from "./pdf.js";

/**
 * Lager PDF-en.
 * @param m møtet ({ type, tittel, dato, tid, sted, referat, referatHash, signatarer, signatarNavn })
 * @param signaturer signaturene på referatet ({ epost, navn, tidspunkt })
 * @param valg { klubbnavn, typeTekst, lenke }
 * @returns { blob, filnavn }
 */
export async function lagReferatPdf(m, signaturer, valg) {
  const { doc, logo } = await nyPdf();
  const { B, H, marg } = A4;
  const type = valg.typeTekst.toLowerCase();
  doc.setProperties({ title: `Referat fra ${type}`, subject: rens(m.tittel || ""), author: rens(valg.klubbnavn), creator: "TPTHK" });

  let y = tegnTopp(doc, logo, valg.klubbnavn);

  y += 14;
  doc.setFont("helvetica", "bold").setFontSize(22).setTextColor(20);
  doc.text(`Referat fra ${type}`, marg, y);
  y += 6;

  y = tegnFelt(doc, y, [
    ["Emne", m.tittel || valg.typeTekst],
    ["Tid", `${datoTekst(m.dato)}${m.tid ? ` kl. ${m.tid}` : ""}`],
    ["Sted", m.sted || "Ikke oppgitt"],
  ]);

  y = tegnMellomtittel(doc, y + 14, "Referat");
  y = tegnTekst(doc, y, m.referat?.trim() || "");

  // Signaturene, i samme rekkefølge som på nettsiden. Står samlet, så de ikke deles over to sider.
  const liste = (m.signatarer || []).map((e) => ({ e, s: signaturer.find((x) => x.epost === e) }));
  const plass = 14 + 11 + liste.length * 6.5 + 18;
  if (y + plass > H - 24) { doc.addPage(); y = 24; } else y += 14;
  y = tegnMellomtittel(doc, y, "Signert");
  doc.setFontSize(11.5);
  for (const { e, s } of liste) {
    doc.setFont("helvetica", "bold").setTextColor(20).text(rens(s?.navn || m.signatarNavn?.[e] || e), marg, y);
    doc.setFont("helvetica", "normal").setTextColor(s ? 20 : 150)
      .text(s ? `Signert ${tidspunkt(s.tidspunkt)}` : "Ikke signert", B - marg, y, { align: "right" });
    y += 6.5;
  }
  y += 4;
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(110);
  const forklaring = "Signert elektronisk av innlogget bruker på klubbens nettside, med tidspunkt. "
    + `Kontrollsum for teksten: ${m.referatHash || "mangler"}.`;
  doc.text(doc.splitTextToSize(forklaring, B - marg * 2), marg, y);

  tegnBunn(doc, valg.lenke ? { tekst: "Referatet ligger også på nettsiden, der du logger inn.", url: valg.lenke } : null);

  const filnavn = `Referat ${type} ${m.dato}.pdf`;
  return { blob: doc.output("blob"), filnavn };
}

const tidspunkt = (t) => (t?.toDate ? t.toDate() : new Date())
  .toLocaleString("nb-NO", { dateStyle: "short", timeStyle: "short" });
