// All kontakt med Firebase samles her, så resten av appen slipper å kjenne til detaljene.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendEmailVerification, sendPasswordResetEmail, signOut, connectAuthEmulator,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator,
  collection, doc, onSnapshot, getDoc, setDoc, updateDoc, deleteDoc, addDoc, writeBatch,
  query, where, serverTimestamp, deleteField,
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
    await updateDoc(doc(db, "medlemmer", id), data);
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

/** Godkjenner en tilgangsforespørsel: oppretter medlem (om nødvendig) og gir tilgang. */
export async function godkjennForesporsel(f, eksisterendeMedlemId) {
  const batch = writeBatch(db);
  let medlemId = eksisterendeMedlemId;
  if (!medlemId) {
    const ref = doc(collection(db, "medlemmer"));
    medlemId = ref.id;
    batch.set(ref, { navn: f.navn, epost: f.epost, telefon: "", hund: "", merknad: "", aktiv: true, kontingent: {}, opprettet: serverTimestamp() });
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
