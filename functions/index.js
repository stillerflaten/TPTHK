// Skyfunksjoner for TPTHK. Publiseres av .github/workflows/funksjoner.yml når noe i functions/ endres på main.
// Se docs/funksjoner-automatisk.md for oppsettet.

import { onDocumentCreated, onDocumentDeleted } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

initializeApp();

const normalEpost = (e) => String(e || "").trim().toLowerCase();

// Når et medlem slettes på nettsiden, slettes også innloggingen (kontoen i Firebase Authentication),
// så personen ikke kan logge inn igjen eller be om ny tilgang med den gamle kontoen.
// Innloggingen beholdes hvis personen fortsatt har tilgang (f.eks. kasserer eller revisor), eller hvis
// samme e-post står på et annet medlem.
// Samtidig ryddes forespørselen om tilgang og fôrabonnementet bort. Søknader, kvitteringer og
// fôrbestillinger beholdes, fordi de hører til regnskapet og fôrrunden.
export const slettInnloggingForMedlem = onDocumentDeleted(
  { document: "medlemmer/{id}", region: "europe-west1" },
  async (event) => {
    const epost = normalEpost(event.data?.data()?.epost);
    if (!epost) return;
    const db = getFirestore();

    if ((await db.doc(`brukere/${epost}`).get()).exists) {
      logger.info("Personen har fortsatt tilgang, innloggingen beholdes.");
      return;
    }
    const andre = await db.collection("medlemmer").where("epost", "==", epost).limit(1).get();
    if (!andre.empty) {
      logger.info("E-posten står på et annet medlem, innloggingen beholdes.");
      return;
    }

    await Promise.all([db.doc(`foresporsler/${epost}`).delete(), db.doc(`forabonnenter/${epost}`).delete()]);

    try {
      const bruker = await getAuth().getUserByEmail(epost);
      await getAuth().deleteUser(bruker.uid);
      logger.info("Innloggingen er slettet.", { uid: bruker.uid });
    } catch (feil) {
      if (feil.code === "auth/user-not-found") {
        logger.info("Medlemmet hadde ingen innlogging.");
        return;
      }
      throw feil;
    }
  },
);

// ---------- Innkalling og referat fra møter på e-post ----------

const TYPE = { styremote: "styremøte", medlemsmote: "medlemsmøte", arsmote: "årsmøte" };
const datoTekst = (iso) => {
  const [a, m, d] = String(iso || "").split("-");
  return d ? `${d}.${m}.${a}` : "";
};
// Mange mottakere deles på flere e-poster, så Gmail ikke avviser den.
const PER_EPOST = 90;

/**
 * Hvem som skal ha innkallingen eller referatet.
 *  - «styret»: de som har styreverv, og kassereren (ikke administratoren). Samme regel som personlista på nettsiden.
 *  - «alle»: alle medlemmer som ikke er meldt ut og har e-post, også støttemedlemmer.
 *  - «aktive»: som «alle», men uten støttemedlemmer (de som bare har tilgang til fôrbestillingen).
 */
async function finnMottakere(db, hvem) {
  if (hvem === "styret") {
    const [verv, kasserere] = await Promise.all([
      db.doc("innstillinger/verv").get(),
      db.collection("brukere").where("rolle", "==", "kasserer").get(),
    ]);
    const liste = [...(verv.data()?.styre || [])];
    for (const b of kasserere.docs) if (b.data().admin !== true) liste.push(b.id);
    return [...new Set(liste.map(normalEpost).filter(Boolean))];
  }
  const [medlemmer, stotte] = await Promise.all([
    db.collection("medlemmer").get(),
    hvem === "aktive" ? db.collection("brukere").where("rolle", "==", "for").get() : null,
  ]);
  const utenom = new Set((stotte?.docs || []).map((d) => normalEpost(d.id)));
  const liste = medlemmer.docs.map((d) => d.data())
    .filter((m) => m.aktiv !== false)
    .map((m) => normalEpost(m.epost))
    .filter((e) => e.includes("@") && !utenom.has(e));
  return [...new Set(liste)];
}

function innkallingstekst(m, id, klubbnavn, oppdatert) {
  const type = TYPE[m.type] || "møte";
  return [
    "Hei!",
    "",
    oppdatert ? "Innkallingen er endret siden den ble sendt sist. Her er den oppdaterte innkallingen." : null,
    oppdatert ? "" : null,
    `Styret i ${klubbnavn} kaller inn til ${type}${m.tittel ? `: ${m.tittel}` : ""}.`,
    "",
    `Tid: ${datoTekst(m.dato)}${m.tid ? ` kl. ${m.tid}` : ""}`,
    m.sted ? `Sted: ${m.sted}` : null,
    "",
    m.innkalling ? "Saksliste:" : null,
    m.innkalling || null,
    m.innkalling ? "" : null,
    `Innkallingen ligger også på nettsiden: https://tpthk.no/#/mote/${id}`,
    "",
    `Hilsen styret i ${klubbnavn}`,
  ].filter((x) => x !== null).join("\n");
}

// Signaturene på et referat, i samme rekkefølge som lista over hvem som skulle signere.
async function signaturliste(db, moteId, m) {
  const sign = (await db.collection("signaturer").where("moteId", "==", moteId).get()).docs.map((d) => d.data());
  return (m.signatarer || []).map((e) => {
    const s = sign.find((x) => x.epost === e);
    const navn = s?.navn || m.signatarNavn?.[e] || e;
    const tid = s?.tidspunkt?.toDate?.().toLocaleString("nb-NO", { timeZone: "Europe/Oslo", dateStyle: "short", timeStyle: "short" });
    return s ? `${navn}, signert ${tid}` : `${navn}, ikke signert`;
  });
}

function referattekst(m, id, klubbnavn, signert) {
  const type = TYPE[m.type] || "møte";
  return [
    "Hei!",
    "",
    `Her er det godkjente referatet fra ${type}${m.tittel ? `: ${m.tittel}` : ""}.`,
    "",
    `Tid: ${datoTekst(m.dato)}${m.tid ? ` kl. ${m.tid}` : ""}`,
    m.sted ? `Sted: ${m.sted}` : null,
    "",
    "Referat:",
    m.referat || "",
    "",
    "Signert elektronisk på klubbens nettside av:",
    ...signert,
    "",
    `Referatet ligger også på nettsiden, der det kan lastes ned som PDF: https://tpthk.no/#/mote/${id}`,
    "",
    `Hilsen styret i ${klubbnavn}`,
  ].filter((x) => x !== null).join("\n");
}

// Styret ber om å sende innkallingen eller det godkjente referatet ved å legge et dokument i «utsendelser»
// (se møtesiden). Gamle utsendelser uten «hva» er innkallinger.
// Funksjonen finner mottakerne selv, slik at ingen på nettsiden kan velge fritt hvem som får e-post,
// og legger e-posten i «mail», som Firebase-utvidelsen «Trigger Email» sender (se docs/epostvarsel.md).
// Svaret (antall mottakere eller feil) skrives tilbake på utsendelsen, så styret ser det på møtesiden.
export const sendInnkalling = onDocumentCreated(
  { document: "utsendelser/{id}", region: "europe-west1" },
  async (event) => {
    const ref = event.data?.ref;
    const u = event.data?.data();
    if (!ref || !u) return;
    const db = getFirestore();
    const ferdig = (felt) => ref.update({ ...felt, behandlet: FieldValue.serverTimestamp() });
    const referat = u.hva === "referat";

    try {
      const moteDok = await db.doc(`moter/${u.moteId}`).get();
      if (!moteDok.exists) return await ferdig({ status: "feil", feil: "Fant ikke møtet." });
      const m = moteDok.data();
      if (referat && m.referatStatus !== "godkjent") {
        return await ferdig({ status: "feil", feil: "Referatet er ikke godkjent ennå." });
      }
      const aapent = m.type === "arsmote" || m.type === "medlemsmote";
      const hvem = aapent ? (u.hvem === "aktive" ? "aktive" : "alle") : "styret";

      const mottakere = await finnMottakere(db, hvem);
      if (!mottakere.length) return await ferdig({ status: "feil", feil: "Fant ingen mottakere med e-post.", hvem });

      // Er det samme sendt før, står det «oppdatert» i e-posten. Et godkjent referat kan ikke endres, så det gjelder bare innkallinger.
      const tidligere = referat ? [] : (await db.collection("utsendelser").where("moteId", "==", u.moteId).where("status", "==", "sendt").get())
        .docs.filter((d) => (d.data().hva || "innkalling") === "innkalling");
      const oppdatert = tidligere.length > 0;
      const klubb = (await db.doc("innstillinger/klubb").get()).data();
      const klubbnavn = klubb?.klubbnavn || "Trøndelag Politis Tjenestehundklubb";
      const tittel = m.tittel || `${TYPE[m.type] ? TYPE[m.type][0].toUpperCase() + TYPE[m.type].slice(1) : "Møte"} ${datoTekst(m.dato)}`;
      const message = referat
        ? { subject: `Referat: ${tittel}`, text: referattekst(m, u.moteId, klubbnavn, await signaturliste(db, u.moteId, m)) }
        : { subject: `${oppdatert ? "Oppdatert innkalling" : "Innkalling"}: ${tittel}`, text: innkallingstekst(m, u.moteId, klubbnavn, oppdatert) };

      const batch = db.batch();
      for (let i = 0; i < mottakere.length; i += PER_EPOST) {
        batch.set(db.collection("mail").doc(), { bcc: mottakere.slice(i, i + PER_EPOST), message, utsendelse: ref.id });
      }
      batch.update(ref, { status: "sendt", antall: mottakere.length, hvem, oppdatert, behandlet: FieldValue.serverTimestamp() });
      await batch.commit();
      logger.info(referat ? "Referatet er lagt til sending." : "Innkallingen er lagt til sending.", { moteId: u.moteId, antall: mottakere.length, hvem });
    } catch (feil) {
      logger.error(referat ? "Klarte ikke å sende referatet." : "Klarte ikke å sende innkallingen.", feil);
      await ferdig({ status: "feil", feil: "Noe gikk galt. Prøv igjen, eller si fra til administratoren." });
    }
  },
);
