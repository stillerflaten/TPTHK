// Utregninger: saldo, summer per kategori og bilagsnummer. Ingen Firebase her, bare tall.

export const standardInnstillinger = {
  klubbnavn: "Trøndelag Politis Tjenestehundklubb",
  kortnavn: "TPTHK",
  orgnr: "",
  kontonummer: "",
  kontingentBelop: 0,
  startSaldo: 0,
  startDato: `${new Date().getFullYear()}-01-01`,
  kategorier: {
    inntekt: ["Kontingent", "Kurs og samlinger", "Konkurranser", "Sponsor og gaver", "Renter", "Annet"],
    utgift: ["Kurs og samlinger", "Konkurranser", "Utstyr", "Premier og gaver", "Bank og gebyrer", "Møter og arrangement", "Annet"],
  },
};

export function medStandard(innst) {
  const i = { ...standardInnstillinger, ...(innst || {}) };
  i.kategorier = {
    inntekt: innst?.kategorier?.inntekt?.length ? innst.kategorier.inntekt : standardInnstillinger.kategorier.inntekt,
    utgift: innst?.kategorier?.utgift?.length ? innst.kategorier.utgift : standardInnstillinger.kategorier.utgift,
  };
  return i;
}

/** Beløp med fortegn: inntekt er pluss, utgift er minus. */
export const signert = (p) => (p.type === "utgift" ? -p.belop : p.belop);

export const aarFor = (p) => Number(String(p.dato).slice(0, 4));

/** Bare poster fra og med startdatoen teller med i saldoen. */
const teller = (p, innst) => p.dato >= innst.startDato;

export function saldoVed(poster, innst, foerDato) {
  return poster
    .filter((p) => teller(p, innst) && p.dato < foerDato)
    .reduce((s, p) => s + signert(p), innst.startSaldo || 0);
}

export function saldoNaa(poster, innst) {
  return poster.filter((p) => teller(p, innst)).reduce((s, p) => s + signert(p), innst.startSaldo || 0);
}

export function aarsregnskap(poster, innst, aar) {
  const iAar = poster.filter((p) => aarFor(p) === aar);
  const sumPer = (type) => {
    const per = new Map();
    for (const p of iAar.filter((p) => p.type === type)) per.set(p.kategori || "Annet", (per.get(p.kategori || "Annet") || 0) + p.belop);
    // Kategorier i samme rekkefølge som i innstillingene, ukjente til slutt.
    const rekkefolge = innst.kategorier[type];
    return [...per.entries()].sort(([a], [b]) => indeks(rekkefolge, a) - indeks(rekkefolge, b) || a.localeCompare(b, "nb"));
  };
  const inntekter = sumPer("inntekt");
  const utgifter = sumPer("utgift");
  const sumInntekter = inntekter.reduce((s, [, v]) => s + v, 0);
  const sumUtgifter = utgifter.reduce((s, [, v]) => s + v, 0);
  const startFor = `${aar}-01-01`;
  const inngaende = innst.startDato > startFor ? (innst.startSaldo || 0) : saldoVed(poster, innst, startFor);
  return {
    aar, poster: iAar, inntekter, utgifter, sumInntekter, sumUtgifter,
    resultat: sumInntekter - sumUtgifter,
    inngaende, utgaende: inngaende + sumInntekter - sumUtgifter,
  };
}

const indeks = (liste, v) => { const i = liste.indexOf(v); return i === -1 ? 999 : i; };

/** Neste ledige bilagsnummer for et år. */
export function nesteBilagsnr(poster, aar) {
  return poster.filter((p) => aarFor(p) === aar).reduce((m, p) => Math.max(m, Number(p.bilagsnr) || 0), 0) + 1;
}

export function sorterPoster(poster) {
  return [...poster].sort((a, b) => b.dato.localeCompare(a.dato) || (Number(b.bilagsnr) || 0) - (Number(a.bilagsnr) || 0));
}

/** Alle år det finnes poster for, pluss inneværende år, nyeste først. */
export function tilgjengeligeAar(poster) {
  const aar = new Set(poster.map(aarFor).filter(Boolean));
  aar.add(new Date().getFullYear());
  return [...aar].sort((a, b) => b - a);
}

export function kontingentStatus(medlemmer, aar) {
  const aktive = medlemmer.filter((m) => m.aktiv !== false);
  const betalt = aktive.filter((m) => m.kontingent?.[aar]?.betalt);
  return { antall: aktive.length, betalt: betalt.length, mangler: aktive.length - betalt.length };
}
