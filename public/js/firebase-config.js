// Firebase-oppsettet for TPTHK Kasserer.
//
// Bytt ut verdiene under med de du får i Firebase-konsollen:
// Prosjektinnstillinger (tannhjulet) → Generelt → «Dine apper» → Nettapp → «SDK setup and configuration» → Config.
//
// Disse verdiene er IKKE hemmelige. De forteller bare nettsiden hvilket Firebase-prosjekt den skal snakke med.
// Det er sikkerhetsreglene (firestore.rules) som bestemmer hvem som får lese og skrive.

export const firebaseConfig = {
  apiKey: "AIzaSyA-CMrfTowPPWQTqWJ_KM11Cd6kQ2E32VE",
  authDomain: "tpthk-3405f.firebaseapp.com",
  projectId: "tpthk-3405f",
  storageBucket: "tpthk-3405f.firebasestorage.app",
  messagingSenderId: "700544728176",
  appId: "1:700544728176:web:fe899d700caf65063ec8b5",
};
