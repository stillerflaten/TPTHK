// Samlebestillingen av fôr som PDF, til fôransvarlig når bestillingen skal sendes til Royal Canin.
// Viser bare fôrtyper og antall, gruppert i kategorier, ikke hvem som har bestilt hva.

import { datoTekst } from "./util.js";
import { nyPdf, rens, tegnTopp, tegnBunn, A4 } from "./pdf.js";

/**
 * @param grupper [[kategori, [{ navn, antall }]]], i den rekkefølgen de skal stå
 * @param valg { klubbnavn, runde, stengt, ansvarlig, bestillinger }
 * @returns { blob, filnavn }
 */
export async function lagSamlebestillingPdf(grupper, valg) {
  const { doc, logo, leverandor } = await nyPdf();
  const { B, H, marg } = A4, bredde = B - marg * 2;
  const rundeDato = valg.runde ? valg.runde.slice(0, 10) : new Date().toISOString().slice(0, 10);
  doc.setProperties({ title: "Samlebestilling fôr", subject: "Royal Canin", author: rens(valg.klubbnavn), creator: "TPTHK" });

  let y = tegnTopp(doc, logo, valg.klubbnavn);

  // Overskrift
  y += 14;
  doc.setFont("helvetica", "bold").setFontSize(22).setTextColor(20).text("Samlebestilling fôr", marg, y);
  y += 6;

  const totalt = grupper.reduce((t, [, l]) => t + l.reduce((s, v) => s + v.antall, 0), 0);
  const felt = [
    ["Leverandør", "Royal Canin"],
    ["Runde", `Åpnet ${datoTekst(rundeDato)}${valg.stengt ? `, stengt ${datoTekst(valg.stengt)}` : ""}`],
    ["Bestilt av", valg.ansvarlig || "Fôransvarlig"],
    ["Totalt", `${totalt} stk fordelt på ${valg.bestillinger} ${valg.bestillinger === 1 ? "bestilling" : "bestillinger"}`],
  ];
  doc.setFontSize(12);
  for (const [navn, verdi] of felt) {
    const linjer = doc.splitTextToSize(rens(verdi), bredde - 32);
    y += 8;
    doc.setFont("helvetica", "bold").setTextColor(90).text(navn, marg, y);
    doc.setFont("helvetica", "normal").setTextColor(20).text(linjer, marg + 32, y);
    y += (linjer.length - 1) * 5.5;
  }

  // Tabellen: fôrtype og antall, med kategoriene som mellomtitler
  const bunn = H - 24, hoyre = B - marg;
  const nySide = () => { doc.addPage(); y = 24; };
  const kolonnetitler = () => {
    doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(90);
    doc.text("FÔRTYPE", marg, y);
    doc.text("ANTALL", hoyre, y, { align: "right" });
    y += 2.5;
    doc.setDrawColor(160).setLineWidth(0.4).line(marg, y, hoyre, y);
    y += 6;
  };
  y += 14;
  kolonnetitler();
  for (const [kategori, liste] of grupper) {
    if (y + 16 > bunn) { nySide(); kolonnetitler(); }
    y += 2;
    doc.setFont("helvetica", "bold").setFontSize(11.5).setTextColor(20).text(rens(kategori), marg, y);
    y += 6.5;
    doc.setFont("helvetica", "normal").setFontSize(11).setTextColor(20);
    for (const v of liste) {
      const linjer = doc.splitTextToSize(rens(v.navn), bredde - 26);
      if (y + linjer.length * 5.4 > bunn) { nySide(); kolonnetitler(); doc.setFont("helvetica", "normal").setFontSize(11).setTextColor(20); }
      doc.text(linjer, marg + 4, y);
      doc.setFont("helvetica", "bold").text(String(v.antall), hoyre, y, { align: "right" }).setFont("helvetica", "normal");
      y += linjer.length * 5.4;
      doc.setDrawColor(225).setLineWidth(0.2).line(marg + 4, y - 3.4, hoyre, y - 3.4);
      y += 1.6;
    }
    y += 3;
  }
  if (y + 12 > bunn) nySide();
  doc.setDrawColor(160).setLineWidth(0.4).line(marg, y, hoyre, y);
  y += 7;
  doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(20).text("Totalt", marg, y);
  doc.text(String(totalt), hoyre, y, { align: "right" });

  tegnBunn(doc, leverandor, null);
  return { blob: doc.output("blob"), filnavn: `Samlebestilling fôr ${rundeDato}.pdf` };
}
