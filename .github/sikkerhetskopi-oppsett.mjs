// Slår på automatisk sikkerhetskopi av Firestore-databasen: én kopi hver natt, som Google tar vare på i 14 dager.
// Brukes av .github/workflows/sikkerhetskopi.yml. Trenger bare Node (ingen pakker) og
// tjenestekontonøkkelen fra Firebase i miljøvariabelen NOKKEL, samme som publiser-regler.mjs.
// Er det alt satt opp, skrives bare oversikten over planen og de siste kopiene ut.

import { createSign } from "node:crypto";

const PROSJEKT = process.argv[2];
const OPPBEVARING_DAGER = 14;
const nokkel = JSON.parse(process.env.NOKKEL || "{}");
if (!PROSJEKT || !nokkel.client_email || !nokkel.private_key) {
  console.error("Mangler prosjekt eller gyldig nøkkel (FIREBASE_SERVICE_ACCOUNT).");
  process.exit(1);
}

const b64 = (x) => Buffer.from(typeof x === "string" ? x : JSON.stringify(x)).toString("base64url");

async function hentToken() {
  const naa = Math.floor(Date.now() / 1000);
  const hode = b64({ alg: "RS256", typ: "JWT" });
  const innhold = b64({
    iss: nokkel.client_email, aud: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/datastore", iat: naa, exp: naa + 600,
  });
  const signatur = createSign("RSA-SHA256").update(`${hode}.${innhold}`).sign(nokkel.private_key, "base64url");
  const svar = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${hode}.${innhold}.${signatur}` }),
  });
  const data = await svar.json();
  if (!svar.ok) throw new Error(`Innlogging med nøkkelen feilet: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function kall(token, metode, sti, body) {
  const svar = await fetch(`https://firestore.googleapis.com/v1/${sti}`, {
    method: metode,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await svar.json();
  if (svar.status === 403) {
    console.error("::error::Nøkkelen har ikke lov til å sette opp sikkerhetskopi. Slå den på i Google Cloud-konsollen i stedet, se docs/sikkerhetskopi-automatisk.md.");
  }
  if (!svar.ok) throw new Error(`${metode} ${sti} feilet (${svar.status}): ${JSON.stringify(data.error || data)}`);
  return data;
}

const token = await hentToken();
const database = `projects/${PROSJEKT}/databases/(default)`;

const { backupSchedules: planer = [] } = await kall(token, "GET", `${database}/backupSchedules`);
if (planer.some((p) => p.dailyRecurrence)) {
  console.log("Automatisk sikkerhetskopi hver natt er allerede slått på.");
} else {
  await kall(token, "POST", `${database}/backupSchedules`, {
    dailyRecurrence: {}, retention: `${OPPBEVARING_DAGER * 24 * 60 * 60}s`,
  });
  console.log(`Automatisk sikkerhetskopi er slått på: én kopi hver natt, som tas vare på i ${OPPBEVARING_DAGER} dager.`);
}

// Vis de siste kopiene, så det er lett å se at det virker (den første kommer natten etter at det er slått på).
const { backups: kopier = [] } = await kall(token, "GET", `projects/${PROSJEKT}/locations/-/backups`);
const ferdige = kopier.filter((k) => k.state === "READY").sort((a, b) => String(b.snapshotTime).localeCompare(String(a.snapshotTime)));
if (ferdige.length) {
  console.log(`Kopier som finnes nå (${ferdige.length}):`);
  for (const k of ferdige.slice(0, 14)) console.log(`  ${String(k.snapshotTime).slice(0, 16).replace("T", " ")} (UTC), slettes ${String(k.expireTime).slice(0, 10)}`);
} else {
  console.log("Ingen kopier ennå. Den første tas i løpet av natten.");
}
