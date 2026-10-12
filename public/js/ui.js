// Felles byggeklosser for skjermbildene: meldinger, dialoger og kvitteringer.

import { esc, html, raw, forberedKvittering, dataUrlTilBlob } from "./util.js";
import { hentKvittering, lagreKvittering } from "./firebase.js";
import { ikon } from "./ikoner.js";

// ---------- Korte beskjeder nederst på skjermen ----------

export function melding(tekst, type = "ok") {
  const el = Object.assign(document.createElement("div"), { className: `toast toast-${type}`, textContent: tekst });
  el.setAttribute("role", type === "feil" ? "alert" : "status");
  document.body.append(el);
  setTimeout(() => el.classList.add("borte"), type === "feil" ? 6000 : 3000);
  setTimeout(() => el.remove(), type === "feil" ? 6500 : 3500);
}

/** Oversetter Firebase-feil til noe forståelig. */
export function feilmelding(e) {
  const kode = e?.code || "";
  const tekster = {
    "auth/invalid-credential": "Feil e-post eller passord.",
    "auth/invalid-email": "E-postadressen ser ikke riktig ut.",
    "auth/user-not-found": "Fant ingen bruker med den e-postadressen.",
    "auth/wrong-password": "Feil passord.",
    "auth/email-already-in-use": "Det finnes allerede en konto med denne e-posten. Prøv å logge inn, eller bruk «Glemt passord».",
    "auth/weak-password": "Passordet må ha minst 6 tegn.",
    "auth/too-many-requests": "For mange forsøk. Vent litt og prøv igjen.",
    "auth/network-request-failed": "Fikk ikke kontakt med nettet. Sjekk dekningen og prøv igjen.",
    "permission-denied": "Du har ikke tilgang til å gjøre dette.",
    "unavailable": "Fikk ikke kontakt med serveren. Endringen lagres når du er på nett igjen.",
  };
  return tekster[kode] || e?.message || "Noe gikk galt.";
}

/** Kjører en handling med knappen deaktivert, og viser feil hvis den feiler. */
export async function medKnapp(knapp, fn) {
  const innhold = knapp?.innerHTML;
  if (knapp) { knapp.disabled = true; knapp.textContent = "Vent litt …"; }
  try {
    return await fn();
  } catch (e) {
    console.error(e);
    melding(feilmelding(e), "feil");
    return undefined;
  } finally {
    if (knapp && knapp.isConnected) { knapp.disabled = false; knapp.innerHTML = innhold; }
  }
}

// ---------- Dialoger ----------

export function dialog(innhold, { bred = false } = {}) {
  const d = document.createElement("dialog");
  d.className = bred ? "dialog bred" : "dialog";
  d.innerHTML = innhold;
  document.body.append(d);
  d.addEventListener("close", () => d.remove());
  d.addEventListener("click", (e) => {
    if (e.target === d || e.target.closest("[data-lukk]")) d.close();
  });
  d.showModal();
  return d;
}

export function bekreft(tekst, { ja = "Ja", nei = "Avbryt", farlig = false } = {}) {
  return new Promise((ok) => {
    const d = dialog(html`
      <p class="dialog-tekst">${tekst}</p>
      <div class="knapper">
        <button class="knapp sekundaer" data-svar="nei">${nei}</button>
        <button class="knapp ${farlig ? "farlig" : ""}" data-svar="ja">${ja}</button>
      </div>`);
    let svar = false;
    d.querySelectorAll("[data-svar]").forEach((b) => b.addEventListener("click", () => { svar = b.dataset.svar === "ja"; d.close(); }));
    d.addEventListener("close", () => ok(svar));
  });
}

// ---------- Kvitteringer ----------

/** Åpner en lagret kvittering: bilder vises i en dialog, PDF-er i ny fane. */
export async function visKvittering(id) {
  const vindu = dialog(`<p class="dialog-tekst">Henter kvittering …</p>`, { bred: true });
  try {
    const k = await hentKvittering(id);
    if (!k) throw new Error("Fant ikke kvitteringen.");
    if (k.type === "application/pdf") {
      vindu.close();
      const url = URL.createObjectURL(dataUrlTilBlob(k.data));
      window.open(url, "_blank");
      return;
    }
    vindu.innerHTML = html`
      <div class="dialog-topp"><strong>${k.navn}</strong><button class="ikonknapp" data-lukk aria-label="Lukk">${raw(ikon("lukk"))}</button></div>
      <img class="kvittering-stor" src="${k.data}" alt="Kvittering ${k.navn}">
      <div class="knapper"><a class="knapp sekundaer" href="${k.data}" download="${k.navn}">Last ned</a></div>`;
  } catch (e) {
    vindu.close();
    melding(feilmelding(e), "feil");
  }
}

/** Knapper for å vise kvitteringer som allerede er lagret. */
export function kvitteringslenker(ids = []) {
  return ids.map((id, i) => html`<button type="button" class="brikke" data-kvittering="${id}">${raw(ikon("binders"))} Kvittering ${ids.length > 1 ? i + 1 : ""}</button>`).join("");
}

export function kobleKvitteringslenker(rot) {
  rot.querySelectorAll("[data-kvittering]").forEach((b) =>
    b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); visKvittering(b.dataset.kvittering); }));
}

/**
 * Felt for å legge til kvitteringer (kamera eller fil). Filene komprimeres med en gang,
 * men lagres først når skjemaet sendes, via lagreNye().
 */
export function kvitteringsvelger(beholder, { eksisterende = [], kanFjerne = true } = {}) {
  let beholdte = [...eksisterende];
  const nye = [];
  const fjernet = [];

  beholder.innerHTML = html`
    <div class="kvitteringer"></div>
    <label class="knapp sekundaer filknapp">
      ${raw(ikon("kamera"))} Legg til kvittering
      <input type="file" accept="image/*,application/pdf" multiple hidden>
    </label>
    <p class="hint">Ta bilde med mobilen eller velg en fil (bilde eller PDF).</p>`;
  const liste = beholder.querySelector(".kvitteringer");
  const input = beholder.querySelector("input");

  const tegn = () => {
    liste.innerHTML = [
      ...beholdte.map((id, i) => html`
        <div class="kvittering-rad">
          <button type="button" class="brikke" data-kvittering="${id}">${raw(ikon("binders"))} Lagret kvittering ${i + 1}</button>
          ${kanFjerne ? raw(html`<button type="button" class="ikonknapp" data-fjern-lagret="${id}" aria-label="Fjern">${raw(ikon("lukk"))}</button>`) : ""}
        </div>`),
      ...nye.map((f, i) => html`
        <div class="kvittering-rad">
          ${f.type.startsWith("image/") ? raw(html`<img class="miniatyr" src="${f.data}" alt="">`) : raw(`<span class="brikke">PDF</span>`)}
          <span class="filnavn">${f.navn}</span>
          <button type="button" class="ikonknapp" data-fjern-ny="${i}" aria-label="Fjern">${raw(ikon("lukk"))}</button>
        </div>`),
    ].join("");
    kobleKvitteringslenker(liste);
    liste.querySelectorAll("[data-fjern-lagret]").forEach((b) => b.addEventListener("click", () => {
      fjernet.push(b.dataset.fjernLagret);
      beholdte = beholdte.filter((id) => id !== b.dataset.fjernLagret);
      tegn();
    }));
    liste.querySelectorAll("[data-fjern-ny]").forEach((b) => b.addEventListener("click", () => {
      nye.splice(Number(b.dataset.fjernNy), 1);
      tegn();
    }));
  };

  input.addEventListener("change", async () => {
    for (const fil of input.files) {
      try {
        nye.push(await forberedKvittering(fil));
      } catch (e) {
        melding(e.message, "feil");
      }
    }
    input.value = "";
    tegn();
  });
  tegn();

  return {
    antall: () => beholdte.length + nye.length,
    fjernet: () => [...fjernet],
    /** Lagrer nye filer og gir tilbake den komplette listen med id-er. */
    async lagreNye() {
      const ids = [...beholdte];
      for (const f of nye) ids.push(await lagreKvittering(f));
      return ids;
    },
  };
}

export { esc };
