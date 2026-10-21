// Skyfunksjoner for TPTHK. Publiseres av .github/workflows/funksjoner.yml når noe i functions/ endres på main.
// Se docs/funksjoner-automatisk.md for oppsettet.

import { onDocumentDeleted } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

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
