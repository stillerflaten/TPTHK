// Styret: hvilke styreverv klubben har, og hvem som har dem.
// Alle ser oversikten. Administratoren bestemmer hvilke verv som finnes; kassereren bestemmer hvem som har dem.
// Under support kan administratoren gjøre begge deler, men ikke sette seg selv i et verv (se firestore.rules).
// Den som har et verv, er med i styret og kan legge ut møteinnkallinger og referater.

import { html, raw } from "../util.js";
import { lagreVerv, normalEpost } from "../firebase.js";
import { melding, medKnapp, bekreft } from "../ui.js";
import { ikon } from "../ikoner.js";
import { erAdmin, erKasserer, ekteKasserer, supportAktiv } from "../tilgang.js";

export const STANDARDVERV = [
  { id: "leder", navn: "Leder" },
  { id: "kasserer", navn: "Kasserer" },
  { id: "sekretar", navn: "Sekretær" },
  { id: "styremedlem", navn: "Styremedlem" },
  { id: "redaktor", navn: "Redaktør" },
];

/** Vervoversikten, med standardvervene hvis ingen er lagret ennå. */
export function vervData(S) {
  const v = S.verv || {};
  return { liste: v.liste || STANDARDVERV, tildelt: v.tildelt || {}, navn: v.navn || {} };
}

/** Navnene på vervene en person har. */
export function vervFor(S, epost) {
  const { liste, tildelt } = vervData(S);
  const e = normalEpost(epost);
  return liste.filter((v) => (tildelt[v.id] || []).includes(e)).map((v) => v.navn);
}

/** Lager dokumentet som lagres: «styre» er alle som har minst ett verv, og «navn» er navnene deres, så alle kan se dem. */
export function byggVerv(liste, tildelt, personer, gamleNavn = {}) {
  const ider = new Set(liste.map((v) => v.id));
  const rent = Object.fromEntries(Object.entries(tildelt).filter(([id, e]) => ider.has(id) && e.length));
  const styre = [...new Set(Object.values(rent).flat())].sort();
  const navn = Object.fromEntries(styre.map((e) => [e, personer.find((p) => p.epost === e)?.navn || gamleNavn[e] || e]));
  return { liste, tildelt: rent, styre, navn };
}

const kanEndreListe = (S) => erAdmin(S) || supportAktiv(S);
const kanVelgePersoner = (S) => erKasserer(S);
const kanTildele = (S) => kanEndreListe(S) || kanVelgePersoner(S);

let redigering = null; // { liste, tildelt } mens noen redigerer

export function styret(main, S) {
  const data = vervData(S);
  if (!kanTildele(S)) redigering = null;
  const r = redigering;
  const personer = [...(S.personer || [])].sort((a, b) => (a.navn || a.epost).localeCompare(b.navn || b.epost, "nb"));
  // Under support kan ikke administratoren velge seg selv.
  const meg = normalEpost(S.bruker?.email);
  const kanVelge = (e) => ekteKasserer(S) || e !== meg || (S.verv?.styre || []).includes(meg);
  const navnPaa = (e) => personer.find((p) => p.epost === e)?.navn || data.navn[e] || e;

  main.innerHTML = html`
    <div class="sidetopp">
      <h1>Styret</h1>
      <div class="knapperad">
        <a class="lenkeknapp" href="#/moter">Til møtene</a>
        ${kanTildele(S) && !r ? raw(`<button class="knapp" id="rediger">Endre verv</button>`) : ""}
      </div>
    </div>

    ${!r ? raw(html`
      <section class="kort">
        <ul class="enkel-liste vervliste">${data.liste.map((v) => {
          const hvem = data.tildelt[v.id] || [];
          return raw(html`<li><span class="verv-navn">${v.navn}</span>
            <span class="${hvem.length ? "" : "hint"}">${hvem.length ? hvem.map(navnPaa).join(", ") : "Ikke besatt"}</span></li>`);
        })}</ul>
        <p class="hint">De som har et verv, kan legge ut møteinnkallinger og referater.</p>
      </section>`)
    : raw(html`
      <section class="kort">
        <h2>Verv og hvem som har dem</h2>
        ${kanEndreListe(S) ? "" : raw(`<p class="hint">Bare administratoren kan legge til, endre navn på eller fjerne verv. Du kan endre hvem som har dem.</p>`)}
        ${kanVelgePersoner(S) ? "" : raw(`<p class="hint">Du kan legge til, endre navn på og fjerne verv. Hvem som har dem, bestemmer kassereren.</p>`)}
        <div class="vervredigering">${r.liste.map((v, i) => raw(html`
          <div class="vervrad" data-i="${i}">
            <div class="vervrad-topp">
              ${kanEndreListe(S)
                ? raw(html`<input class="verv-navnfelt" data-navn="${i}" value="${v.navn}" aria-label="Navn på vervet" maxlength="60">
                  <span class="vervrad-knapper">
                    <button type="button" class="ikonknapp" data-opp="${i}" aria-label="Flytt opp" ${i === 0 ? "disabled" : ""}>${raw(ikon("pil", "opp"))}</button>
                    <button type="button" class="ikonknapp" data-ned="${i}" aria-label="Flytt ned" ${i === r.liste.length - 1 ? "disabled" : ""}>${raw(ikon("pil", "ned"))}</button>
                    <button type="button" class="ikonknapp" data-fjern-verv="${i}" aria-label="Fjern vervet">${raw(ikon("lukk"))}</button>
                  </span>`)
                : raw(html`<strong>${v.navn}</strong>`)}
            </div>
            <div class="brikker">${(r.tildelt[v.id] || []).map((e) => raw(html`
              <span class="brikke">${navnPaa(e)}${kanVelgePersoner(S) ? raw(html`<button type="button" class="ikonknapp" data-fjern-person="${v.id}|${e}" aria-label="Fjern ${navnPaa(e)}">${raw(ikon("lukk"))}</button>`) : ""}</span>`))}
              ${kanVelgePersoner(S) ? raw(html`<select class="legg-til-person" data-verv="${v.id}" aria-label="Legg til person som ${v.navn}">
                <option value="">+ Legg til person …</option>
                ${personer.filter((p) => !(r.tildelt[v.id] || []).includes(p.epost) && kanVelge(p.epost)).map((p) => raw(html`<option value="${p.epost}">${p.navn || p.epost}</option>`))}
              </select>`) : ""}
            </div>
          </div>`))}
        </div>
        ${kanEndreListe(S) ? raw(`
          <div class="ny-kategori nytt-verv">
            <input id="nyttVerv" placeholder="Nytt verv, f.eks. Nestleder" maxlength="60">
            <button type="button" class="knapp sekundaer liten" id="leggTilVerv">Legg til verv</button>
          </div>`) : ""}
        <p class="hint">Bare personer med innlogging kan velges. Vervet «Kasserer» er en tittel i styret. Tilgang til regnskapet gis under Innstillinger.</p>
        <div class="knapper">
          <button type="button" class="knapp sekundaer" id="avbryt">Avbryt</button>
          <button type="button" class="knapp" id="lagre">Lagre</button>
        </div>
      </section>`)}`;

  const tegnPaaNytt = () => styret(main, S);

  main.querySelector("#rediger")?.addEventListener("click", () => {
    redigering = { liste: data.liste.map((v) => ({ ...v })), tildelt: structuredClone(data.tildelt) };
    tegnPaaNytt();
  });
  if (!r) return;

  main.querySelectorAll("[data-navn]").forEach((inp) => inp.addEventListener("input", () => { r.liste[Number(inp.dataset.navn)].navn = inp.value; }));
  const flytt = (i, til) => { const [v] = r.liste.splice(i, 1); r.liste.splice(til, 0, v); tegnPaaNytt(); };
  main.querySelectorAll("[data-opp]").forEach((b) => b.addEventListener("click", () => flytt(Number(b.dataset.opp), Number(b.dataset.opp) - 1)));
  main.querySelectorAll("[data-ned]").forEach((b) => b.addEventListener("click", () => flytt(Number(b.dataset.ned), Number(b.dataset.ned) + 1)));
  main.querySelectorAll("[data-fjern-verv]").forEach((b) => b.addEventListener("click", async () => {
    const v = r.liste[Number(b.dataset.fjernVerv)];
    const hvem = r.tildelt[v.id] || [];
    if (hvem.length && !(await bekreft(`Fjerne vervet «${v.navn}»? ${hvem.map(navnPaa).join(", ")} mister det.`, { ja: "Fjern" }))) return;
    r.liste = r.liste.filter((x) => x !== v);
    delete r.tildelt[v.id];
    tegnPaaNytt();
  }));
  main.querySelectorAll("[data-fjern-person]").forEach((b) => b.addEventListener("click", () => {
    const [id, e] = b.dataset.fjernPerson.split("|");
    r.tildelt[id] = (r.tildelt[id] || []).filter((x) => x !== e);
    tegnPaaNytt();
  }));
  main.querySelectorAll(".legg-til-person").forEach((sel) => sel.addEventListener("change", () => {
    if (!sel.value) return;
    r.tildelt[sel.dataset.verv] = [...(r.tildelt[sel.dataset.verv] || []), sel.value];
    tegnPaaNytt();
  }));

  const leggTil = () => {
    const felt = main.querySelector("#nyttVerv");
    const navn = felt.value.trim();
    if (!navn) return;
    if (r.liste.some((v) => v.navn.toLowerCase() === navn.toLowerCase())) return melding("Det vervet finnes allerede.", "feil");
    const grunn = navn.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "verv";
    let id = grunn;
    for (let n = 2; r.liste.some((v) => v.id === id); n++) id = `${grunn}-${n}`;
    r.liste.push({ id, navn });
    tegnPaaNytt();
    main.querySelector("#nyttVerv")?.focus();
  };
  main.querySelector("#leggTilVerv")?.addEventListener("click", leggTil);
  main.querySelector("#nyttVerv")?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); leggTil(); } });

  main.querySelector("#avbryt").addEventListener("click", () => { redigering = null; tegnPaaNytt(); });
  main.querySelector("#lagre").addEventListener("click", (e) => {
    const liste = r.liste.map((v) => ({ id: v.id, navn: v.navn.trim() }));
    if (liste.some((v) => !v.navn)) return melding("Alle verv må ha et navn.", "feil");
    medKnapp(e.currentTarget, async () => {
      await lagreVerv(byggVerv(liste, r.tildelt, personer, data.navn));
      redigering = null;
      melding("Styrevervene er lagret.");
      tegnPaaNytt();
    });
  });
}
styret.live = true;
styret.tittel = "Styret";
styret.trenger = ["verv", "personer"];
