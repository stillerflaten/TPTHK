// All kontakt med Firebase samles her, så resten av appen slipper å kjenne til detaljene.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendEmailVerification, sendPasswordResetEmail, signOut, connectAuthEmulator,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator,
  collection, doc, onSnapshot, getDoc, setDoc, updateDoc, deleteDoc, addDoc, writeBatch,
  query, where, serverTimestamp, deleteField, getDocsFromServer, getDocFromServer, Timestamp,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

export const erKonfigurert = !String(firebaseConfig.apiKey).includes("LIM-INN");

// Lokal testing mot Firebase-emulatorene: åpne siden med ?emulator på localhost.
export const brukEmulator = ["localhost", "127.0.0.1"].includes(location.hostname)
  && new URLSearchParams(location.search).has("emulator");

const config = brukEmulator ? { apiKey: "demo", projectId: "demo-tpthk", authDomain: "localhost" } : firebaseConfig;
const app = (erKonfigurert || brukEmulator) ? initializeApp(config) : null;

export const klar = Boolean(app);
export const auth = app ? getAuth(app) : null;
export const db = app ? initializeFirestore(app, brukEmulator ? {} : {
  // Lagrer data lokalt, så appen er rask og tåler dårlig dekning.
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
}) : null;

if (brukEmulator) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}

export const normalEpost = (e) => String(e || "").trim().toLowerCase();
const meg = () => normalEpost(auth.currentUser?.email);

// ---------- Innlogging ----------

export const konto = {
  vedEndring: (cb) => onAuthStateChanged(auth, cb),
  loggInn: (epost, passord) => signInWithEmailAndPassword(auth, epost.trim(), passord),
  opprettKonto: async (epost, passord) => {
    const { user } = await createUserWithEmailAndPassword(auth, epost.trim(), passord);
    await sendEmailVerification(user);
    return user;
  },
  sendBekreftelsePaaNytt: () => sendEmailVerification(auth.currentUser),
  glemtPassord: (epost) => sendPasswordResetEmail(auth, epost.trim()),
  loggUt: () => signOut(auth),
  // Etter at brukeren har trykket på lenken i e-posten må vi hente ny status fra Firebase.
  oppdater: async () => {
    await auth.currentUser.reload();
    await auth.currentUser.getIdToken(true);
    return auth.currentUser;
  },
};

// ---------- Lytting ----------

const medId = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

/** Lytter på en hel samling og gir tilbake en liste med { id, ...data }. */
export const lyttSamling = (navn, cb, feil) => onSnapshot(collection(db, navn), (s) => cb(medId(s)), feil);

export const lyttDokument = (samling, id, cb, feil) =>
  onSnapshot(doc(db, samling, id), (d) => cb(d.exists() ? { id: d.id, ...d.data() } : null), feil);

export const lyttMineSoknader = (cb, feil) =>
  onSnapshot(query(collection(db, "soknader"), where("epost", "==", meg())), (s) => cb(medId(s)), feil);

// ---------- Tilgang ----------

export const lyttProfil = (cb, feil) => lyttDokument("brukere", meg(), cb, feil);

export const lagreBruker = (epost, data) => setDoc(doc(db, "brukere", normalEpost(epost)), data, { merge: true });
export const slettBruker = (epost) => deleteDoc(doc(db, "brukere", normalEpost(epost)));
export const oppdaterMinProfil = (data) => updateDoc(doc(db, "brukere", meg()), data);

// ---------- Support ----------
// Kasserer eller styret kan gi administratoren full tilgang i 24 timer. Reglene sjekker tiden mot serverens klokke.

export const SUPPORT_TIMER = 24;

/** Lytter på supportstatus. «utloper» er millisekunder, regnet ut fra når supporten ble startet. */
export const lyttSupport = (cb, feil) => onSnapshot(doc(db, "innstillinger", "support"), (d) => {
  if (!d.exists()) return cb(null);
  const data = d.data({ serverTimestamps: "estimate" });
  const startet = data.startet?.toMillis?.() ?? null;
  cb({
    ...data,
    startet,
    utloper: startet == null ? null : startet + SUPPORT_TIMER * 3600 * 1000,
    avsluttet: data.avsluttet?.toMillis?.() ?? null,
  });
}, feil);

export const startSupport = (navn) => setDoc(doc(db, "innstillinger", "support"), {
  startet: serverTimestamp(), startetAv: meg(), startetAvNavn: navn || "",
});

export const avsluttSupport = () => updateDoc(doc(db, "innstillinger", "support"), {
  avsluttet: serverTimestamp(), avsluttetAv: meg(),
});

export const lyttMinForesporsel = (cb, feil) => lyttDokument("foresporsler", meg(), cb, feil);
export const sendForesporsel = (navn) =>
  setDoc(doc(db, "foresporsler", meg()), { navn: navn.trim(), epost: meg(), tidspunkt: serverTimestamp() });
export const slettForesporsel = (epost) => deleteDoc(doc(db, "foresporsler", normalEpost(epost)));

// ---------- Poster (inntekter og utgifter) ----------

export async function lagrePost(id, data) {
  const felt = { ...data, endret: serverTimestamp(), endretAv: meg() };
  if (id) {
    await updateDoc(doc(db, "poster", id), felt);
    return id;
  }
  const ref = await addDoc(collection(db, "poster"), { ...felt, opprettet: serverTimestamp(), opprettetAv: meg() });
  return ref.id;
}

export async function slettPost(post) {
  const batch = writeBatch(db);
  batch.delete(doc(db, "poster", post.id));
  if (post.soknadId) {
    // Posten kom fra en søknad: søknaden går tilbake til «godkjent» og beholder kvitteringene.
    batch.update(doc(db, "soknader", post.soknadId), { status: "godkjent", postId: deleteField() });
  } else {
    for (const k of post.kvitteringIds || []) batch.delete(doc(db, "kvitteringer", k));
  }
  if (post.medlemId && post.kontingentAar) {
    batch.update(doc(db, "medlemmer", post.medlemId), { [`kontingent.${post.kontingentAar}`]: deleteField() });
  }
  await batch.commit();
}

// ---------- Import fra nettbanken ----------
// En post husker hvilken transaksjon i kontoutskriften den kom fra i «bank»: { [kontoId]: transaksjons-id }.

/** Kobler en post som alt er ført, til en transaksjon fra banken. */
export const kobleTilBank = (postId, kontoId, transId) =>
  updateDoc(doc(db, "poster", postId), { [`bank.${kontoId}`]: transId });

/** Transaksjoner kassereren har valgt å hoppe over, huskes i innstillingene. */
/** Datoen lagres, så «Nullstill regnskap» kan fjerne overhoppingene for ett år. */
export const hoppOverBank = (transId, hopp, dato) =>
  setDoc(doc(db, "innstillinger", "klubb"), { bankHoppet: { [transId]: hopp ? (dato || true) : deleteField() } }, { merge: true });

// ---------- Nullstille regnskapet ----------

/**
 * Sletter postene (for ett år eller alle), og rydder opp som når én post slettes: kvitteringene slettes,
 * søknader går tilbake til «godkjent», og kontingenten merkes som ubetalt. Fjerner også avstemmingen og
 * overhoppede banktransaksjoner for de samme årene. Medlemmer, søknader, kategorier, kontoer, budsjett og møter beholdes.
 * @param {number|null} aar  null = alle år
 */
export async function nullstillRegnskap({ poster, soknader, medlemmer, innst, aar }, fremdrift) {
  const soknadIds = new Set(soknader.map((s) => s.id));
  const medlemIds = new Set(medlemmer.map((m) => m.id));
  const liste = [];
  for (const p of poster) {
    liste.push({ samling: "poster", id: p.id, slett: true });
    if (p.soknadId) {
      if (soknadIds.has(p.soknadId)) liste.push({ samling: "soknader", id: p.soknadId, endre: { status: "godkjent", postId: deleteField() } });
    } else {
      for (const k of p.kvitteringIds || []) liste.push({ samling: "kvitteringer", id: k, slett: true });
    }
    if (p.medlemId && p.kontingentAar && medlemIds.has(p.medlemId)) {
      liste.push({ samling: "medlemmer", id: p.medlemId, endre: { [`kontingent.${p.kontingentAar}`]: deleteField() } });
    }
  }
  const klubb = {};
  if (aar == null) {
    klubb.avstemming = deleteField();
    klubb.bankHoppet = deleteField();
  } else {
    if (innst.avstemming?.[aar]) klubb[`avstemming.${aar}`] = deleteField();
    for (const [id, v] of Object.entries(innst.bankHoppet || {})) {
      if (String(v).startsWith(`${aar}-`)) klubb[`bankHoppet.${id}`] = deleteField();
    }
  }
  if (Object.keys(klubb).length) liste.push({ samling: "innstillinger", id: "klubb", endre: klubb });
  await skrivMange(liste, fremdrift);
}

// ---------- Kvitteringer ----------
// Lagres som komprimerte bilder i egne dokumenter, så de bare lastes når noen åpner dem.

export async function lagreKvittering(fil) {
  const ref = await addDoc(collection(db, "kvitteringer"), {
    navn: fil.navn, type: fil.type, data: fil.data, eier: meg(), lastetOpp: serverTimestamp(),
  });
  return ref.id;
}

export async function hentKvittering(id) {
  const d = await getDoc(doc(db, "kvitteringer", id));
  return d.exists() ? d.data() : null;
}

export const slettKvittering = (id) => deleteDoc(doc(db, "kvitteringer", id));

// ---------- Medlemmer og kontingent ----------

export async function lagreMedlem(id, data) {
  if (id) {
    // hund-feltet er tatt bort fra skjemaet; rydd det bort fra eldre medlemmer når de lagres.
    await updateDoc(doc(db, "medlemmer", id), { ...data, hund: deleteField() });
    return id;
  }
  const ref = await addDoc(collection(db, "medlemmer"), { ...data, kontingent: {}, opprettet: serverTimestamp() });
  return ref.id;
}

export async function slettMedlem(medlem, fjernTilgang) {
  const batch = writeBatch(db);
  batch.delete(doc(db, "medlemmer", medlem.id));
  if (fjernTilgang && medlem.epost) batch.delete(doc(db, "brukere", normalEpost(medlem.epost)));
  await batch.commit();
}

/** Markerer kontingent som betalt, og fører den eventuelt som inntekt i samme operasjon. */
export async function registrerKontingent(medlem, aar, { dato, belop, post }) {
  const batch = writeBatch(db);
  let postId = null;
  if (post) {
    const ref = doc(collection(db, "poster"));
    postId = ref.id;
    batch.set(ref, {
      ...post, medlemId: medlem.id, kontingentAar: aar,
      opprettet: serverTimestamp(), opprettetAv: meg(), endret: serverTimestamp(), endretAv: meg(),
    });
  }
  batch.update(doc(db, "medlemmer", medlem.id), { [`kontingent.${aar}`]: { betalt: true, dato, belop, postId } });
  await batch.commit();
}

export async function angreKontingent(medlem, aar) {
  const info = medlem.kontingent?.[aar];
  const batch = writeBatch(db);
  if (info?.postId) batch.delete(doc(db, "poster", info.postId));
  batch.update(doc(db, "medlemmer", medlem.id), { [`kontingent.${aar}`]: deleteField() });
  await batch.commit();
}

/** Husker når kassereren sist sendte påminnelse om kontingent til disse medlemmene. */
export async function registrerPaminnelse(medlemIder, aar, dato) {
  const batch = writeBatch(db);
  for (const id of medlemIder) batch.update(doc(db, "medlemmer", id), { [`paminnet.${aar}`]: dato });
  await batch.commit();
}

/** Godkjenner en tilgangsforespørsel: oppretter medlem (om nødvendig) og gir tilgang. */
export async function godkjennForesporsel(f, eksisterendeMedlemId) {
  const batch = writeBatch(db);
  let medlemId = eksisterendeMedlemId;
  if (!medlemId) {
    const ref = doc(collection(db, "medlemmer"));
    medlemId = ref.id;
    batch.set(ref, { navn: f.navn, epost: f.epost, telefon: "", merknad: "", aktiv: true, kontingent: {}, opprettet: serverTimestamp() });
  }
  batch.set(doc(db, "brukere", f.epost), { rolle: "medlem", navn: f.navn, medlemId }, { merge: true });
  batch.delete(doc(db, "foresporsler", f.epost));
  await batch.commit();
}

// ---------- Søknader om refusjon ----------

export async function sendSoknad(data) {
  const ref = await addDoc(collection(db, "soknader"), {
    ...data, epost: meg(), status: "sendt", opprettet: serverTimestamp(),
  });
  return ref.id;
}

export async function trekkSoknad(soknad) {
  const batch = writeBatch(db);
  batch.delete(doc(db, "soknader", soknad.id));
  for (const k of soknad.kvitteringIds || []) batch.delete(doc(db, "kvitteringer", k));
  await batch.commit();
}

export const behandleSoknad = (id, data) =>
  updateDoc(doc(db, "soknader", id), { ...data, behandlet: serverTimestamp(), behandletAv: meg() });

/** Utbetalt: fører søknaden som utgift i regnskapet og låser kvitteringene. */
export async function utbetalSoknad(soknad, post) {
  const batch = writeBatch(db);
  const ref = doc(collection(db, "poster"));
  batch.set(ref, {
    ...post, soknadId: soknad.id, kvitteringIds: soknad.kvitteringIds || [],
    opprettet: serverTimestamp(), opprettetAv: meg(), endret: serverTimestamp(), endretAv: meg(),
  });
  batch.update(doc(db, "soknader", soknad.id), {
    status: "utbetalt", postId: ref.id, utbetaltDato: post.dato, behandlet: serverTimestamp(), behandletAv: meg(),
  });
  for (const k of soknad.kvitteringIds || []) batch.update(doc(db, "kvitteringer", k), { laast: true });
  await batch.commit();
  return ref.id;
}

// ---------- Innstillinger ----------

export const lagreInnstillinger = (data) => setDoc(doc(db, "innstillinger", "klubb"), data, { merge: true });
export const lagreMedlemsinfo = (data) => setDoc(doc(db, "innstillinger", "medlemsinfo"), data, { merge: true });

// ---------- Møter, referater og signering ----------

/** Lager en kontrollsum av referatet. Den lagres med hver signatur, så man kan se at teksten ikke er endret etterpå. */
export async function referatHash(moteId, tekst) {
  const bytes = new TextEncoder().encode(`${moteId}\n${tekst}`);
  const sum = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(sum)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function lagreMote(id, data) {
  const felt = { ...data, endret: serverTimestamp(), endretAv: meg() };
  if (id) {
    await updateDoc(doc(db, "moter", id), felt);
    return id;
  }
  const ref = await addDoc(collection(db, "moter"), {
    ...felt, referatStatus: "ingen", opprettet: serverTimestamp(), opprettetAv: meg(),
  });
  return ref.id;
}

export async function slettMote(mote, signaturer) {
  const batch = writeBatch(db);
  for (const s of signaturer) batch.delete(doc(db, "signaturer", s.id));
  batch.delete(doc(db, "referatutkast", mote.id));
  batch.delete(doc(db, "moter", mote.id));
  await batch.commit();
}

export async function hentReferatutkast(moteId) {
  const d = await getDoc(doc(db, "referatutkast", moteId));
  return d.exists() ? d.data() : null;
}

/** Lagrer referatet som utkast (bare styret ser det). */
export async function lagreReferatutkast(mote, { tekst, signatarer }) {
  const batch = writeBatch(db);
  batch.set(doc(db, "referatutkast", mote.id), { tekst, signatarer, endret: serverTimestamp(), endretAv: meg() });
  if (mote.referatStatus === "ingen") batch.update(doc(db, "moter", mote.id), { referatStatus: "utkast" });
  await batch.commit();
}

/** Sender referatet til signering: teksten blir synlig for alle med tilgang, og kan ikke endres uten å trekkes tilbake. */
export async function sendTilSignering(mote, { tekst, signatarer, navn }) {
  const hash = await referatHash(mote.id, tekst);
  const batch = writeBatch(db);
  batch.set(doc(db, "referatutkast", mote.id), { tekst, signatarer, endret: serverTimestamp(), endretAv: meg() });
  batch.update(doc(db, "moter", mote.id), {
    referatStatus: "signering", referat: tekst, referatHash: hash, signatarer, signatarNavn: navn,
    sendtTilSignering: serverTimestamp(), sendtAv: meg(),
  });
  await batch.commit();
}

/** Trekker referatet tilbake fra signering. Signaturene som er gitt, slettes. */
export async function trekkTilbakeReferat(mote, signaturer) {
  const batch = writeBatch(db);
  for (const s of signaturer) batch.delete(doc(db, "signaturer", s.id));
  batch.update(doc(db, "moter", mote.id), {
    referatStatus: "utkast", referat: deleteField(), referatHash: deleteField(), signatarer: deleteField(),
    signatarNavn: deleteField(), sendtTilSignering: deleteField(), sendtAv: deleteField(),
  });
  await batch.commit();
}

/** Signerer referatet. Er man den siste, blir referatet samtidig markert som godkjent. */
export async function signerReferat(mote, navn, erSist) {
  const batch = writeBatch(db);
  batch.set(doc(db, "signaturer", `${mote.id}__${meg()}`), {
    moteId: mote.id, epost: meg(), navn, hash: mote.referatHash, tidspunkt: serverTimestamp(),
  });
  if (erSist) batch.update(doc(db, "moter", mote.id), { referatStatus: "godkjent", godkjent: serverTimestamp() });
  await batch.commit();
}

export const markerGodkjent = (mote) =>
  updateDoc(doc(db, "moter", mote.id), { referatStatus: "godkjent", godkjent: serverTimestamp() });

export const lagrePersonliste = (liste) => setDoc(doc(db, "innstillinger", "personer"), { liste });

// ---------- Styreverv ----------

/** Lagrer hele vervoversikten: hvilke verv som finnes, og hvem som har dem. */
export const lagreVerv = ({ liste, tildelt, styre, navn }) =>
  setDoc(doc(db, "innstillinger", "verv"), { liste, tildelt, styre, navn, endret: serverTimestamp(), endretAv: meg() });

// ---------- Regelverk ----------
// Vedtekter og andre regler. PDF-ene deles i biter, fordi et Firestore-dokument kan være maks 1 MB.
// Bitene ligger i «regelverkfiler» med ID «fil-ID__nr», så de bare lastes når noen åpner dokumentet.

const REGELBIT = 900_000;

/** Deler en PDF (base64) i biter og lagrer dem. Gir tilbake fil-ID og antall biter. */
export async function lagreRegelfil(base64, filId = doc(collection(db, "regelverkfiler")).id) {
  const biter = [];
  for (let i = 0; i < base64.length; i += REGELBIT) biter.push(base64.slice(i, i + REGELBIT));
  // Én og én bit, så store filer ikke sprenger grensen for hvor mye som kan sendes på en gang.
  for (const [nr, data] of biter.entries()) {
    await setDoc(doc(db, "regelverkfiler", `${filId}__${nr}`), { filId, nr, data });
  }
  return { id: filId, deler: biter.length };
}

/** Henter en fil (PDF eller Word) fra regelverket og gir den tilbake som base64. */
export async function hentRegelfil(fil) {
  const biter = await Promise.all(Array.from({ length: fil.deler }, (_, nr) => getDoc(doc(db, "regelverkfiler", `${fil.id}__${nr}`))));
  if (biter.some((b) => !b.exists())) throw new Error("Fant ikke hele fila. Prøv igjen, eller be styret laste den opp på nytt.");
  return biter.map((b) => b.data().data).join("");
}

async function slettRegelfil(fil) {
  if (!fil?.id) return;
  const batch = writeBatch(db);
  for (let nr = 0; nr < fil.deler; nr++) batch.delete(doc(db, "regelverkfiler", `${fil.id}__${nr}`));
  await batch.commit();
}

/**
 * Lagrer et dokument i regelverket. fil = { navn, storrelse, base64 } når en ny fil (PDF eller Word) er valgt.
 * Er det en lenke (eller en ny fil), slettes den gamle fila etterpå.
 */
export async function lagreRegel(regel, data, nyFil) {
  const ref = regel ? doc(db, "regelverk", regel.id) : doc(collection(db, "regelverk"));
  let fil = regel?.fil || null;
  if (nyFil) fil = { ...(await lagreRegelfil(nyFil.base64)), navn: nyFil.navn, storrelse: nyFil.storrelse };
  if (data.lenke) fil = null;
  await setDoc(ref, {
    ...data,
    lenke: data.lenke || deleteField(),
    fil: fil || deleteField(),
    endret: serverTimestamp(), endretAv: meg(),
    ...(regel ? {} : { opprettet: serverTimestamp(), opprettetAv: meg() }),
  }, { merge: true });
  if (regel?.fil && regel.fil.id !== fil?.id) await slettRegelfil(regel.fil).catch(() => {});
  return ref.id;
}

export async function slettRegel(regel) {
  await deleteDoc(doc(db, "regelverk", regel.id));
  await slettRegelfil(regel.fil).catch(() => {});
}

// ---------- Sikkerhetskopi ----------
// Leses rett fra serveren (ikke fra lageret på telefonen), så kopien blir komplett.

export const hentSamling = async (navn) => medId(await getDocsFromServer(collection(db, navn)));

export async function hentDokument(samling, id) {
  const d = await getDocFromServer(doc(db, samling, id));
  return d.exists() ? { id: d.id, ...d.data() } : null;
}

export const erTidspunkt = (v) => v instanceof Timestamp;
export const tidspunktFra = (ms) => Timestamp.fromMillis(ms);

export const merkSikkerhetskopi = (navn) => setDoc(doc(db, "innstillinger", "klubb"), {
  sisteSikkerhetskopi: { tid: serverTimestamp(), av: meg(), navn: navn || "" },
}, { merge: true });

/**
 * Skriver dokumenter i omganger. Firestore tåler maks 500 endringer og 10 MB per omgang,
 * og kvitteringene er store, så vi deler opp etter både antall og størrelse.
 * @param {{samling: string, id: string, data?: object, endre?: object, slett?: boolean}[]} liste  data = nytt dokument, endre = oppdater felt, slett = slett dokumentet
 */
export async function skrivMange(liste, fremdrift = () => {}) {
  let batch = writeBatch(db);
  let antall = 0;
  let bytes = 0;
  let ferdig = 0;
  for (const s of liste) {
    const ref = doc(db, s.samling, s.id);
    if (s.slett) batch.delete(ref);
    else if (s.endre) batch.update(ref, s.endre);
    else batch.set(ref, s.data);
    const str = s.slett ? 100 : JSON.stringify(s.data || s.endre).length;
    antall++;
    bytes += str;
    if (antall >= 400 || bytes > 4_000_000) {
      await batch.commit();
      ferdig += antall;
      fremdrift(ferdig);
      batch = writeBatch(db);
      antall = 0;
      bytes = 0;
    }
  }
  if (antall) await batch.commit();
  fremdrift(ferdig + antall);
}
