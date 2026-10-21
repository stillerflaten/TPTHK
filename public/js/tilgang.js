// Hvem som får se hva. Samme logikk som i firestore.rules, så menyene stemmer med det databasen tillater.

/** Administratoren (den som drifter nettsiden) har full tilgang bare mens support er aktiv. */
export const supportAktiv = (S) =>
  S.profil?.admin === true && Boolean(S.support) && !S.support.avsluttet
  && S.support.utloper != null && S.support.utloper > Date.now();

/** Support er bedt om og ikke utløpt, uansett hvem som ser på. */
export const supportPaagaar = (S) =>
  Boolean(S.support) && !S.support.avsluttet && S.support.utloper != null && S.support.utloper > Date.now();

export const ekteKasserer = (S) => S.profil?.rolle === "kasserer";
/** Har et styreverv (se innstillinger/verv). */
export const harVerv = (S) => Boolean(S.bruker) && (S.verv?.styre || []).includes(String(S.bruker.email || "").toLowerCase());
export const ekteStyret = (S) => ekteKasserer(S) || harVerv(S);
export const erAdmin = (S) => S.profil?.admin === true;

/** Kan be om support: kasserer eller styret, men ikke administratoren selv. */
export const kanBeOmSupport = (S) => ekteStyret(S) && S.profil?.admin !== true;

export const erKasserer = (S) => ekteKasserer(S) || supportAktiv(S);
export const erStyret = (S) => ekteStyret(S) || supportAktiv(S);

/** Når revisortilgangen går ut, i millisekunder. null = ingen utløpsdato. */
export const revisorUtloper = (p) => p?.revisorTil?.toMillis?.() ?? null;

/** Revisor: kan lese regnskapet med bilag og kvitteringer, men ikke endre noe. Tilgangen kan ha en sluttdato. */
export const erRevisor = (S) => S.profil?.revisor === true
  && (revisorUtloper(S.profil) == null || revisorUtloper(S.profil) > Date.now());

/** Støttemedlem som bare kan bestille fôr (rolle «for»). Ser bare fôrsiden. */
export const bareFor = (S) => S.profil?.rolle === "for";

/** Revisor som ikke er medlem av klubben. Ser bare regnskapet. */
export const eksternRevisor = (S) => S.profil?.rolle === "revisor";

/** Ser regnskapet (oversikt, årsrapport). */
export const seRegnskap = (S) => erKasserer(S) || erStyret(S) || erRevisor(S);

/** Fôransvarlig (innstillinger/for): ser alle fôrbestillingene og styrer bestillingsrundene. */
export const erForansvarlig = (S) => Boolean(S.bruker)
  && (S.forInnst?.ansvarlige || []).includes(String(S.bruker.email || "").toLowerCase());
export const styrerFor = (S) => erForansvarlig(S) || supportAktiv(S);
/** Velger hvem som er fôransvarlig: kassereren eller administratoren. */
export const kanVelgeForansvarlig = (S) => erKasserer(S) || erAdmin(S);
