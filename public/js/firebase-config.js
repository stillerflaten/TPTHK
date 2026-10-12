// Firebase-oppsettet for TPTHK Kasserer.
//
// Bytt ut verdiene under med de du får i Firebase-konsollen:
// Prosjektinnstillinger (tannhjulet) → Generelt → «Dine apper» → Nettapp → «SDK setup and configuration» → Config.
//
// Disse verdiene er IKKE hemmelige. De forteller bare nettsiden hvilket Firebase-prosjekt den skal snakke med.
// Det er sikkerhetsreglene (firestore.rules) som bestemmer hvem som får lese og skrive.

export const firebaseConfig = {
  apiKey: "LIM-INN-HER",
  authDomain: "LIM-INN-HER",
  projectId: "LIM-INN-HER",
  storageBucket: "LIM-INN-HER",
  messagingSenderId: "LIM-INN-HER",
  appId: "LIM-INN-HER",
};
