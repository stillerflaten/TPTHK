// Publiserer firestore.rules til Firebase via Firebase Rules API.
// Brukes av .github/workflows/regler.yml. Trenger bare Node (ingen pakker) og
// tjenestekontonøkkelen fra Firebase i miljøvariabelen NOKKEL.
//
// Vi bruker ikke firebase-tools her, fordi det først sjekker at Firestore-API-et er slått på,
// og den sjekken krever en tillatelse som Firebase-nøkkelen ikke har.

import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

const PROSJEKT = process.argv[2];
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
    scope: "https://www.googleapis.com/auth/firebase", iat: naa, exp: naa + 600,
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
  const svar = await fetch(`https://firebaserules.googleapis.com/v1/${sti}`, {
    method: metode,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await svar.json();
  if (!svar.ok) throw new Error(`${metode} ${sti} feilet (${svar.status}): ${JSON.stringify(data.error || data)}`);
  return data;
}

const token = await hentToken();
const regler = readFileSync("firestore.rules", "utf8");

// 1. Last opp reglene som et nytt regelsett (Firebase sjekker samtidig at de er gyldige).
const sett = await kall(token, "POST", `projects/${PROSJEKT}/rulesets`, {
  source: { files: [{ name: "firestore.rules", content: regler }] },
});
console.log(`Regelsett lastet opp: ${sett.name}`);

// 2. Ta det i bruk for Firestore.
const release = `projects/${PROSJEKT}/releases/cloud.firestore`;
await kall(token, "PATCH", release, { release: { name: release, rulesetName: sett.name } });
console.log("Reglene er publisert til Firestore.");
