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
