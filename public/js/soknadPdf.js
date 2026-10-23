// Refusjonssøknader som PDF, til kassererens perm: én søknad, eller alle i en periode med en oversikt først.
// Hver søknad får egen side satt opp som en regning (som klubbens gamle Word-mal), og kvitteringene følger etter. Bilder legges rett inn med jsPDF.
// Kvitteringer som er PDF settes inn som egne sider med pdf-lib til slutt, siden jsPDF ikke kan lese PDF-er.

import { datoTekst, kr } from "./util.js";
import { nyPdf, rens, tegnTopp, tegnBunn, A4, hentPdfLib } from "./pdf.js";

const MM = 72 / 25.4; // pdf-lib regner i punkter

/** Leser bredde og høyde på et bilde (data-URL). */
function bildeMaal(data) {
  return new Promise((ok) => {
    const img = new Image();
    img.onload = () => ok({ b: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => ok(null);
    img.src = data;
  });
}

const base64TilBytes = (data) => Uint8Array.from(atob(data.slice(data.indexOf(",") + 1)), (c) => c.charCodeAt(0));

/** Henter alle kvitteringene og gjør dem klare: bilder med mål, PDF-er lest inn med pdf-lib. */
async function hentKvitteringer(soknader, hent) {
  const ider = [...new Set(soknader.flatMap((s) => s.kvitteringIds || []))];
  const rå = await Promise.all(ider.map((id) => hent(id).catch(() => null)));
  const PDFLib = rå.some((k) => k?.type === "application/pdf") ? await hentPdfLib() : null;
  const klare = await Promise.all(rå.map(async (k) => {
    const data = String(k?.data || "");
    if (k?.type === "application/pdf" && data.startsWith("data:application/pdf;base64,")) {
      try {
        return { pdf: await PDFLib.PDFDocument.load(base64TilBytes(data), { ignoreEncryption: true }) };
      } catch {
        return { feil: true };
      }
    }
    if (/^data:image\/(jpeg|png);base64,/.test(data)) {
      const maal = await bildeMaal(data);
      return maal ? { bilde: data, format: data.startsWith("data:image/png") ? "PNG" : "JPEG", ...maal } : { feil: true };
    }
    return { feil: true };
  }));
  return new Map(ider.map((id, i) => [id, klare[i]]));
}

/**
 * Lager PDF-en.
 * @param soknader søknadene, i den rekkefølgen de skal stå
 * @param valg { klubbnavn, statusTekst, bilag(s) → «12/2026» eller "", periode: { fra, til } (bare samle-PDF), hent(id) → kvittering }
 * @returns { blob, filnavn }
 */
export async function lagSoknaderPdf(soknader, valg) {
  const [{ doc, logo }, kvitteringer] = await Promise.all([nyPdf(), hentKvitteringer(soknader, valg.hent)]);
  const { B, H, marg } = A4, bredde = B - marg * 2, bunn = H - 22;
  const samlet = Boolean(valg.periode);
  doc.setProperties({ title: samlet ? "Refusjonssøknader" : "Regning", author: rens(valg.klubbnavn), creator: "TPTHK" });

  // PDF-kvitteringer som skal settes inn etter en bestemt side, med teksten som skal stå øverst.
  const innsett = [];
  let forste = true;
  const nySide = () => { if (!forste) doc.addPage(); forste = false; };

  if (samlet) {
    nySide();
    tegnOversikt(doc, logo, soknader, valg);
  }

  for (const s of soknader) {
    nySide();
    let y = tegnRegning(doc, s, tegnTopp(doc, logo, valg.klubbnavn), valg);
    const bilag = valg.bilag(s);
    const ider = s.kvitteringIds || [];

    // Kvitteringene: bilder fyller resten av siden og nye sider, PDF-er settes inn etterpå.
    ider.forEach((id, i) => {
      const k = kvitteringer.get(id);
      const tittel = `Kvittering ${ider.length > 1 ? `${i + 1} av ${ider.length}` : ""}`.trim();
      const undertittel = `${tittel} · ${s.navn}, ${datoTekst(s.dato)}${bilag ? ` · bilag ${bilag}` : ""}`;
      if (k?.bilde) {
        let plass = bunn - y - 9;
        if (plass < 90) { doc.addPage(); y = 20; plass = bunn - y - 9; }
        const skala = Math.min(bredde / k.b, plass / k.h);
        const b = k.b * skala, h = k.h * skala;
        y += 6;
        doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(90).text(rens(undertittel), marg, y);
        y += 3;
        doc.addImage(k.bilde, k.format, marg, y, b, h, undefined, "FAST");
        y += h + 6;
      } else if (k?.pdf) {
        innsett.push({ etterSide: doc.getNumberOfPages(), pdf: k.pdf, tekst: rens(undertittel) });
        y = bunn; // det som kommer etter PDF-sidene, starter på ny side
      } else {
        if (y + 14 > bunn) { doc.addPage(); y = 20; }
        y += 8;
        doc.setFont("helvetica", "normal").setFontSize(11).setTextColor(160, 30, 30)
          .text(rens(`${tittel} kunne ikke legges ved. Åpne søknaden på nettsiden og skriv den ut derfra.`), marg, y, { maxWidth: bredde });
        y += 11;
      }
    });
  }

  const filnavn = samlet
    ? `Søknader ${datoTekst(valg.periode.fra)}-${datoTekst(valg.periode.til)}.pdf`
    : `Søknad ${String(soknader[0].navn || "").trim()} ${datoTekst(soknader[0].dato)}.pdf`.replace(/[\\/:*?"<>|]/g, "");

  if (!innsett.length) {
    tegnBunn(doc, null);
    return { blob: doc.output("blob"), filnavn };
  }
  return { blob: await settInnPdfer(doc, innsett), filnavn };
}

const visKonto = (nr) => String(nr || "").replace(/\D/g, "").replace(/^(\d{4})(\d{2})(\d{5})$/, "$1.$2.$3");
const klokke = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/**
 * Selve regningen, satt opp som klubbens gamle mal: hva det gjelder, spesifisering med sum, kontonummer,
 * søkerens signatur (innlogget bekreftelse) og vedlegg. Under kommer kassererens attestasjon og vedtaket.
 * Gir y-posisjonen under.
 */
function tegnRegning(doc, s, y, valg) {
  const { B, marg } = A4, hoyre = B - marg, bredde = B - marg * 2;
  const bilag = valg.bilag(s);
  const ider = s.kvitteringIds || [];
  const sendt = s.opprettet?.toDate ? s.opprettet.toDate() : null;

  y += 14;
  doc.setFont("helvetica", "bold").setFontSize(22).setTextColor(20).text("Regning", marg, y);
  if (bilag) doc.setFontSize(14).text(`Bilag ${bilag}`, hoyre, y, { align: "right" });
  y += 6;
  doc.setFont("helvetica", "normal").setFontSize(11).setTextColor(100).text("Refusjon av utlegg", marg, y);

  // Gjelder
  y += 11;
  doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(90).text("GJELDER", marg, y);
  const gjelder = doc.setFont("helvetica", "normal").setFontSize(12).splitTextToSize(rens(s.formaal), bredde);
  y += 6;
  doc.setTextColor(20).text(gjelder, marg, y);
  y += (gjelder.length - 1) * 5.5 + 6;
  doc.setFontSize(10).setTextColor(100).text(rens(`Dato for utlegget: ${datoTekst(s.dato)}`), marg, y);

  // Spesifisering med sum
  y += 11;
  const linjer = s.linjer?.length ? s.linjer : [{ tekst: "Utlegg", belop: s.belop }];
  doc.setFont("helvetica", "normal").setFontSize(12).setTextColor(20);
  for (const l of linjer) {
    const t = doc.splitTextToSize(rens(l.tekst), bredde - 45);
    doc.text(t, marg, y);
    doc.text(rens(kr(l.belop)), hoyre, y, { align: "right" });
    y += (t.length - 1) * 5.5 + 7;
  }
  doc.setDrawColor(120).setLineWidth(0.4).line(marg, y - 4, hoyre, y - 4);
  y += 2;
  doc.setFont("helvetica", "bold").setFontSize(13).text("Sum", marg, y);
  doc.text(rens(kr(s.belop)), hoyre, y, { align: "right" });

  y += 12;
  doc.setFont("helvetica", "normal").setFontSize(12)
    .text(rens(`Overstående beløp bes utbetalt til kontonummer: ${visKonto(s.kontonummer)}`), marg, y);

  // Signatur med penn, som revisorene krever. Under står når og av hvem søknaden ble sendt inn på nettsiden.
  y += 14;
  doc.setFont("helvetica", "normal").setFontSize(11).setTextColor(20).text("Sted og dato:", marg, y);
  doc.setDrawColor(120).setLineWidth(0.3).line(marg + 26, y + 1, marg + 95, y + 1);
  y += 20;
  doc.line(marg, y, marg + 95, y);
  y += 5;
  doc.setFontSize(11).text(rens(s.navn), marg, y);
  doc.setFontSize(9).setTextColor(100).text("Signatur", marg + 95, y, { align: "right" });
  y += 6;
  const innsendt = `Sendt inn på tpthk.no${sendt ? ` ${datoTekst(isoDato(sendt))} kl. ${klokke(sendt)}` : ""}, innlogget som ${s.epost}.`
    + (s.bekreftet ? " Søkeren bekreftet at opplysningene stemmer, og at utlegget ikke er dekket på annen måte." : "");
  const sig = doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(100).splitTextToSize(rens(innsendt), bredde);
  doc.text(sig, marg, y);
  y += (sig.length - 1) * 4.2;

  // Vedlegg
  y += 10;
  doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(90).text("VEDLEGG", marg, y);
  doc.setFont("helvetica", "normal").setFontSize(11).setTextColor(20);
  if (!ider.length) { y += 6; doc.text("Ingen", marg, y); }
  ider.forEach((_, i) => { y += 6; doc.text(`Kvittering ${ider.length > 1 ? i + 1 : ""}`.trim() + " (følger under)", marg, y); });

  // Kassererens behandling: attestasjon, vedtak og utbetaling
  const felt = [
    ["Status", valg.statusTekst[s.status] || s.status],
    ["Godkjent", s.godkjentAv ? `${datoTekst(s.godkjentDato)} av ${s.godkjentAv}` : ""],
    ["Vedtak", s.vedtak],
    ["Utbetalt", datoTekst(s.utbetaltDato)],
    ["Kommentar", s.kommentar],
  ].filter(([, v]) => v);
  y += 12;
  const topp = y;
  y += 7;
  doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(90).text("KLUBBENS BEHANDLING", marg + 4, y);
  doc.setFontSize(11);
  for (const [navn, verdi] of felt) {
    const t = doc.splitTextToSize(rens(verdi), bredde - 38);
    y += 6.5;
    doc.setFont("helvetica", "bold").setTextColor(90).text(navn, marg + 4, y);
    doc.setFont("helvetica", "normal").setTextColor(20).text(t, marg + 32, y);
    y += (t.length - 1) * 5;
  }
  y += 5;
  doc.setDrawColor(200).setLineWidth(0.4).roundedRect(marg, topp, bredde, y - topp, 2, 2);
  return y + 4;
}

const isoDato = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Første side i samle-PDF-en: periode, antall, sum og en tabell over søknadene. */
function tegnOversikt(doc, logo, soknader, valg) {
  const { B, marg } = A4, hoyre = B - marg, bunn = A4.H - 24;
  let y = tegnTopp(doc, logo, valg.klubbnavn);
  y += 14;
  doc.setFont("helvetica", "bold").setFontSize(22).setTextColor(20).text("Refusjonssøknader", marg, y);
  y += 6;
  const sum = soknader.reduce((t, s) => t + (s.belop || 0), 0);
  const felt = [
    ["Periode", `${datoTekst(valg.periode.fra)} til ${datoTekst(valg.periode.til)}`],
    ["Utvalg", valg.periode.utvalg],
    ["Antall", `${soknader.length} ${soknader.length === 1 ? "søknad" : "søknader"}`],
    ["Sum", kr(sum)],
  ];
  doc.setFontSize(12);
  for (const [navn, verdi] of felt) {
    y += 8;
    doc.setFont("helvetica", "bold").setTextColor(90).text(navn, marg, y);
    doc.setFont("helvetica", "normal").setTextColor(20).text(rens(verdi), marg + 32, y);
  }

  // Kolonner: bilag, dato, søker, gjelder (og status hvis ikke alle er utbetalt), beløp
  const medStatus = soknader.some((s) => s.status !== "utbetalt");
  const kol = { bilag: marg, dato: marg + 15, soker: marg + 36, gjelder: marg + 70, status: hoyre - 52 };
  const gjelderBredde = (medStatus ? kol.status : hoyre - 26) - kol.gjelder - 3;
  const kortStatus = (s) => String(valg.statusTekst[s.status] || s.status).split(" –")[0];
  const kutt = (tekst, mm) => {
    const t = rens(tekst).replace(/\s+/g, " ");
    if (doc.getTextWidth(t) <= mm) return t;
    let k = t;
    while (k && doc.getTextWidth(`${k}…`) > mm) k = k.slice(0, -1);
    return `${k.trimEnd()}…`;
  };
  const titler = () => {
    doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(90);
    doc.text("BILAG", kol.bilag, y);
    doc.text("DATO", kol.dato, y);
    doc.text("SØKER", kol.soker, y);
    doc.text("GJELDER", kol.gjelder, y);
    if (medStatus) doc.text("STATUS", kol.status, y);
    doc.text("BELØP", hoyre, y, { align: "right" });
    y += 2.5;
    doc.setDrawColor(160).setLineWidth(0.4).line(marg, y, hoyre, y);
    y += 5.5;
  };
  y += 14;
  titler();
  doc.setFontSize(10);
  for (const s of soknader) {
    if (y + 6 > bunn) { doc.addPage(); y = 24; titler(); }
    doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(20);
    doc.text(valg.bilag(s) || "–", kol.bilag, y);
    doc.text(datoTekst(s.utbetaltDato || s.dato), kol.dato, y);
    doc.text(kutt(s.navn, kol.gjelder - kol.soker - 3), kol.soker, y);
    doc.text(kutt(s.formaal, gjelderBredde), kol.gjelder, y);
    if (medStatus) doc.text(kutt(kortStatus(s), hoyre - 26 - kol.status), kol.status, y);
    doc.text(rens(kr(s.belop)), hoyre, y, { align: "right" });
    doc.setDrawColor(225).setLineWidth(0.2).line(marg, y + 2.2, hoyre, y + 2.2);
    y += 6.5;
  }
  if (y + 10 > bunn) { doc.addPage(); y = 24; }
  doc.setDrawColor(160).setLineWidth(0.4).line(marg, y - 2.5, hoyre, y - 2.5);
  y += 3;
  doc.setFont("helvetica", "bold").setFontSize(11).text("Sum", marg, y);
  doc.text(rens(kr(sum)), hoyre, y, { align: "right" });
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(110);
  doc.text("Datoen er utbetalingsdatoen for utbetalte søknader, ellers datoen for utlegget.", marg, y + 9);
}

/**
 * Slår sammen jsPDF-dokumentet med PDF-kvitteringene: hver side i en kvittering legges skalert på en A4-side
 * med en linje øverst om hvilken søknad den hører til. Til slutt får alle sidene sidetall nederst.
 */
async function settInnPdfer(doc, innsett) {
  const { PDFDocument, StandardFonts, rgb, degrees } = await hentPdfLib();
  const kilde = await PDFDocument.load(doc.output("arraybuffer"));
  const ut = await PDFDocument.create();
  const skrift = await ut.embedFont(StandardFonts.Helvetica);
  const fet = await ut.embedFont(StandardFonts.HelveticaBold);
  const [Bp, Hp, m] = [A4.B * MM, A4.H * MM, A4.marg * MM];
  const sider = await ut.copyPages(kilde, kilde.getPageIndices());

  for (let i = 0; i < sider.length; i++) {
    ut.addPage(sider[i]);
    for (const k of innsett.filter((x) => x.etterSide === i + 1)) {
      const innebygd = await ut.embedPages(k.pdf.getPages());
      innebygd.forEach((side, n) => {
        const ny = ut.addPage([Bp, Hp]);
        const tekst = innebygd.length > 1 ? `${k.tekst} (side ${n + 1} av ${innebygd.length})` : k.tekst;
        ny.drawText(tekst, { x: m, y: Hp - 20 * MM, size: 10, font: fet, color: rgb(0.35, 0.35, 0.35) });
        tegnSkalert(ny, side, k.pdf.getPage(n).getRotation().angle, { x: m, y: 22 * MM, b: Bp - m * 2, h: Hp - 46 * MM }, degrees);
      });
    }
  }

  const alle = ut.getPages();
  alle.forEach((side, i) => {
    const tekst = `Side ${i + 1} av ${alle.length}`;
    const { width } = side.getSize();
    side.drawText(tekst, { x: width - m - skrift.widthOfTextAtSize(tekst, 9), y: 12 * MM - 3, size: 9, font: skrift, color: rgb(0.47, 0.47, 0.47) });
  });
  return new Blob([await ut.save()], { type: "application/pdf" });
}

/** Tegner en innebygd side så stor som mulig innenfor rammen, og retter opp sider som er rotert i originalen. */
function tegnSkalert(side, innebygd, vinkel, ramme, degrees) {
  const v = ((vinkel % 360) + 360) % 360;
  const liggende = v === 90 || v === 270;
  const [b, h] = liggende ? [innebygd.height, innebygd.width] : [innebygd.width, innebygd.height];
  const s = Math.min(ramme.b / b, ramme.h / h);
  // Plassér øverst og midt på i rammen.
  const venstre = ramme.x + (ramme.b - b * s) / 2, nede = ramme.y + ramme.h - h * s;
  const pos = {
    0: { x: venstre, y: nede },
    90: { x: venstre, y: nede + h * s },
    180: { x: venstre + b * s, y: nede + h * s },
    270: { x: venstre + b * s, y: nede },
  }[v] || { x: venstre, y: nede };
  side.drawPage(innebygd, { ...pos, xScale: s, yScale: s, rotate: degrees(-v) });
}
