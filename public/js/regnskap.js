// Utregninger: saldo, summer per kategori og bilagsnummer. Ingen Firebase her, bare tall.

export const standardInnstillinger = {
  klubbnavn: "Trøndelag Politis Tjenestehundklubb",
  kortnavn: "TPTHK",
  orgnr: "",
  startDato: `${new Date().getFullYear()}-01-01`,
  kontoer: [],
  kategorier: {
    inntekt: ["Kontingent", "Kurs og samlinger", "Konkurranser", "Sponsor og gaver", "Renter", "Annet"],
    utgift: ["Kurs og samlinger", "Konkurranser", "Utstyr", "Premier og gaver", "Bank og gebyrer", "Møter og arrangement", "Annet"],
  },
};

export const STANDARDKONTO = "hoved";

export function medStandard(innst) {
  const i = { ...standardInnstillinger, ...(innst || {}) };
  i.kategorier = {
    inntekt: innst?.kategorier?.inntekt?.length ? innst.kategorier.inntekt : standardInnstillinger.kategorier.inntekt,
    utgift: innst?.kategorier?.utgift?.length ? innst.kategorier.utgift : standardInnstillinger.kategorier.utgift,
  };
  // Har ingen kontoer blitt lagt inn ennå, finnes det én standardkonto (med en eventuell gammel startsaldo).
  i.kontoer = innst?.kontoer?.length
    ? innst.kontoer
    : [{ id: STANDARDKONTO, navn: "Brukskonto", kontonummer: "", startSaldo: innst?.startSaldo || 0 }];
  return i;
}

export const kontoFor = (p, innst) => p.konto || innst.kontoer[0].id;
export const kontonavn = (id, innst) => innst.kontoer.find((k) => k.id === id)?.navn || "Ukjent konto";

/**
 * Hvor mye en post endrer saldoen. Uten konto: endring for klubben totalt (overføringer gir 0).
 * Med konto: endring for akkurat den kontoen.
 */
export function endring(p, innst, konto) {
  if (p.type === "overforing") {
    if (!konto) return 0;
    return (p.tilKonto === konto ? p.belop : 0) - (p.fraKonto === konto ? p.belop : 0);
  }
  if (konto && kontoFor(p, innst) !== konto) return 0;
  return p.type === "utgift" ? -p.belop : p.belop;
}

export const aarFor = (p) => Number(String(p.dato).slice(0, 4));

const startSaldo = (innst, konto) =>
  innst.kontoer.filter((k) => !konto || k.id === konto).reduce((s, k) => s + (k.startSaldo || 0), 0);

/** Saldo før en gitt dato. Bare poster fra og med startdatoen teller med. */
export function saldoVed(poster, innst, foerDato, konto) {
  if (innst.startDato >= foerDato) return startSaldo(innst, konto);
  return poster
    .filter((p) => p.dato >= innst.startDato && p.dato < foerDato)
    .reduce((s, p) => s + endring(p, innst, konto), startSaldo(innst, konto));
}

export const saldoNaa = (poster, innst, konto) => saldoVed(poster, innst, "9999-12-31", konto);

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
  const fra = `${aar}-01-01`;
  const til = `${aar + 1}-01-01`;
  const kontoer = innst.kontoer.map((k) => ({
    ...k, inngaende: saldoVed(poster, innst, fra, k.id), utgaende: saldoVed(poster, innst, til, k.id),
  }));
  return {
    aar, poster: iAar, inntekter, utgifter, sumInntekter, sumUtgifter, kontoer,
    resultat: sumInntekter - sumUtgifter,
    inngaende: saldoVed(poster, innst, fra),
    utgaende: saldoVed(poster, innst, til),
  };
}

const indeks = (liste, v) => { const i = liste.indexOf(v); return i === -1 ? 999 : i; };

const tid = (p) => p.opprettet?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;

/**
 * Bilagsnummer settes automatisk etter dato innen hvert år, så de følger kontoutskriftene.
 * Poster med samme dato nummereres i den rekkefølgen de ble registrert.
 */
export function nummererBilag(poster) {
  const sortert = [...poster].sort((a, b) => a.dato.localeCompare(b.dato) || tid(a) - tid(b) || a.id.localeCompare(b.id));
  const teller = new Map();
  return sortert.map((p) => {
    const aar = aarFor(p);
    const nr = (teller.get(aar) || 0) + 1;
    teller.set(aar, nr);
    return { ...p, bilagsnr: nr };
  });
}

/** Hvilket bilagsnummer en ny post med denne datoen vil få. */
export function bilagsnrForNy(poster, dato) {
  const aar = aarFor({ dato });
  return poster.filter((p) => aarFor(p) === aar && p.dato <= dato).length + 1;
}

/** Nyeste først. */
export function sorterPoster(poster) {
  return [...poster].sort((a, b) => b.dato.localeCompare(a.dato) || (b.bilagsnr || 0) - (a.bilagsnr || 0));
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
