// Lager innkallingen til et møte som PDF med klubbens logo: emne, tid, sted og saksliste.
// Felles topp, bunn og lasting av PDF-biblioteket ligger i pdf.js.

import { datoTekst } from "./util.js";
import { nyPdf, rens, tegnTopp, tegnBunn, tegnFelt, tegnMellomtittel, tegnTekst, A4 } from "./pdf.js";

/**
 * Lager PDF-en.
 * @param m møtet ({ type, tittel, dato, tid, sted, innkalling, id })
 * @param valg { klubbnavn, typeTekst, aapent, lenke }
 * @returns { blob, filnavn }
 */
export async function lagInnkallingPdf(m, valg) {
  const { doc, logo } = await nyPdf();
  const { marg } = A4;
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
  y = tegnFelt(doc, y, felt);

  // Saksliste
  y = tegnMellomtittel(doc, y + 14, "Saksliste");
  tegnTekst(doc, y, m.innkalling?.trim() || "Ingen saksliste er lagt inn.");

  // Bunntekst på hver side
  tegnBunn(doc, valg.lenke ? { tekst: "Innkallingen ligger også på nettsiden, der du logger inn.", url: valg.lenke } : null);

  const filnavn = `Innkalling ${type} ${m.dato}.pdf`;
  return { blob: doc.output("blob"), filnavn };
}
