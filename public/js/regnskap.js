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

/** Alle år det finnes poster for, pluss inneværende år og eventuelle ekstra år (f.eks. med budsjett), nyeste først. */
export function tilgjengeligeAar(poster, ekstra = []) {
  const aar = new Set(poster.map(aarFor).filter(Boolean));
  aar.add(new Date().getFullYear());
  for (const a of ekstra) if (Number.isInteger(a) && a > 1900) aar.add(a);
  return [...aar].sort((a, b) => b - a);
}

export function kontingentStatus(medlemmer, aar) {
  const aktive = medlemmer.filter((m) => m.aktiv !== false);
  const betalt = aktive.filter((m) => m.kontingent?.[aar]?.betalt);
  return { antall: aktive.length, betalt: betalt.length, mangler: aktive.length - betalt.length };
}

// ---------- Budsjett ----------
// Lagres i innstillinger/klubb som budsjett: { "2026": { inntekt: [{ kategori, belop }], utgift: [...] } }.
// Lister (ikke kart) fordi de byttes ut i sin helhet når de lagres, så fjernede kategorier forsvinner.

/** Budsjettet for et år som kart per kategori, med summer. «finnes» er false hvis det ikke er lagt inn noe. */
export function budsjettFor(innst, aar) {
  const b = innst.budsjett?.[aar] || {};
  const kart = (type) => new Map((b[type] || []).filter((x) => x.belop).map((x) => [x.kategori, x.belop]));
  const inntekt = kart("inntekt");
  const utgift = kart("utgift");
  const sum = (m) => [...m.values()].reduce((s, v) => s + v, 0);
  const sumInntekter = sum(inntekt);
  const sumUtgifter = sum(utgift);
  return {
    aar, inntekt, utgift, sumInntekter, sumUtgifter, resultat: sumInntekter - sumUtgifter,
    finnes: inntekt.size + utgift.size > 0, endret: b.endret || null, endretAv: b.endretAv || "",
  };
}

/** Alle kategorinavn som har tall i minst én av kildene, i samme rekkefølge som i innstillingene. */
export function kategorierFra(innst, type, ...kilder) {
  const navn = new Set();
  for (const k of kilder) for (const kat of k.keys()) navn.add(kat);
  const rekkefolge = innst.kategorier[type];
  return [...navn].sort((a, b) => indeks(rekkefolge, a) - indeks(rekkefolge, b) || a.localeCompare(b, "nb"));
}

/** Avvik mellom regnskap og budsjett, og om avviket er bra for klubben (mer inntekt eller mindre utgift). */
export function avvik(type, faktisk, budsjett) {
  const diff = faktisk - budsjett;
  return { diff, bra: type === "utgift" ? diff <= 0 : diff >= 0 };
}

// ---------- Føring og avstemming ----------

/**
 * Posten som to føringslinjer, slik den ville stått i en kontoplan: pengene ut av én konto og inn på en annen.
 * Utgift: minus på bankkontoen, pluss på kategorien. Inntekt: pluss på bankkontoen, minus på kategorien.
 * Linjene går alltid i null. Beløp i øre, med fortegn.
 */
export function foeringslinjer(p, innst) {
  if (p.type === "overforing") {
    return [
      { konto: kontonavn(p.fraKonto, innst), bank: true, belop: -p.belop },
      { konto: kontonavn(p.tilKonto, innst), bank: true, belop: p.belop },
    ];
  }
  const bank = kontonavn(kontoFor(p, innst), innst);
  const kategori = p.kategori || "Uten kategori";
  return p.type === "utgift"
    ? [{ konto: bank, bank: true, belop: -p.belop }, { konto: kategori, belop: p.belop }]
    : [{ konto: bank, bank: true, belop: p.belop }, { konto: kategori, belop: -p.belop }];
}

// Lagres i innstillinger/klubb som avstemming: { "2026": { kontoer: { [kontoId]: øre | null }, endret, endretAv } }.

/**
 * Avstemming mot bankens årsoppgave for et år: beregnet saldo 31.12 per konto, saldoen kassereren
 * har skrevet inn fra årsoppgaven, og differansen. «stemmer» er null når årsoppgaven ikke er lagt inn.
 */
export function avstemming(poster, innst, aar) {
  const a = innst.avstemming?.[aar] || {};
  const til = `${aar + 1}-01-01`;
  const kontoer = innst.kontoer.map((k) => {
    const beregnet = saldoVed(poster, innst, til, k.id);
    const bank = typeof a.kontoer?.[k.id] === "number" ? a.kontoer[k.id] : null;
    const antall = poster.filter((p) => aarFor(p) === aar && endring(p, innst, k.id) !== 0).length;
    return { ...k, beregnet, bank, antall, differanse: bank == null ? null : beregnet - bank, stemmer: bank == null ? null : beregnet === bank };
  });
  const utfylt = kontoer.filter((k) => k.bank != null);
  return {
    aar, kontoer, endret: a.endret || null, endretAv: a.endretAv || "",
    ferdig: utfylt.length === kontoer.length && kontoer.length > 0,
    stemmer: utfylt.length === kontoer.length && kontoer.every((k) => k.stemmer),
    finnes: utfylt.length > 0,
  };
}
