// Lager innkallingen til et møte som PDF med klubbens logo: emne, tid, sted og saksliste.
// Felles topp, bunn og lasting av PDF-biblioteket ligger i pdf.js.

import { datoTekst } from "./util.js";
import { nyPdf, rens, tegnTopp, tegnBunn, A4 } from "./pdf.js";

/**
 * Lager PDF-en.
 * @param m møtet ({ type, tittel, dato, tid, sted, innkalling, id })
 * @param valg { klubbnavn, typeTekst, aapent, lenke }
 * @returns { blob, filnavn }
 */
export async function lagInnkallingPdf(m, valg) {
  const { doc, logo, leverandor } = await nyPdf();
  const { B, H, marg } = A4, bredde = B - marg * 2;
  const type = valg.typeTekst.toLowerCase();
  doc.setProperties({ title: `Innkalling til ${type}`, subject: rens(m.tittel || ""), author: rens(valg.klubbnavn), creator: "TPTHK" });

  // Topp: logo og klubbnavn
  let y = tegnTopp(doc, logo, valg.klubbnavn);

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
  tegnBunn(doc, leverandor, valg.lenke ? { tekst: "Innkallingen ligger også på nettsiden, der du logger inn.", url: valg.lenke } : null);

  const filnavn = `Innkalling ${type} ${m.dato}.pdf`;
  return { blob: doc.output("blob"), filnavn };
}
