// Hovedfila: holder styr på hvem som er logget inn, henter data og bytter mellom sidene.

import {
  klar, auth, konto, lyttProfil, lyttSamling, lyttDokument, lyttMineSoknader, lyttMinForesporsel, normalEpost,
} from "./firebase.js";
import { html, raw, esc, aarNaa } from "./util.js";
import { medStandard, tilgjengeligeAar } from "./regnskap.js";
import * as innlogging from "./views/innlogging.js";
import * as oversikt from "./views/oversikt.js";
import * as poster from "./views/poster.js";
import * as rapport from "./views/rapport.js";
import * as soknader from "./views/soknader.js";
import * as medlemmer from "./views/medlemmer.js";
import * as innstillinger from "./views/innstillinger.js";
import * as minside from "./views/minside.js";

const main = document.getElementById("innhold");
const meny = document.getElementById("meny");
const topp = document.getElementById("topp-hoyre");

/** Alt appen vet akkurat nå. Sidene leser herfra. */
export const S = {
  bruker: null,
  profil: undefined, // undefined = ikke lastet, null = finnes ikke (ingen tilgang)
  foresporsel: null,
  poster: [], medlemmer: [], soknader: [], brukere: [], foresporsler: [],
  innst: medStandard(null),
  info: {},
  mittMedlem: null,
  aar: aarNaa(),
  lastet: new Set(),
};

// Forespørsler fra folk som allerede har tilgang (f.eks. kassereren selv under oppsett) skjules.
let alleForesporsler = [];
Object.defineProperty(S, "foresporsler", {
  get() {
    const harTilgang = new Set(S.brukere.map((b) => b.id));
    return alleForesporsler.filter((f) => !harTilgang.has(f.id));
  },
  set(v) { alleForesporsler = v; },
  enumerable: true,
});

let stoppLyttere = [];
let gjeldendeSide = null;

// ---------- Sider ----------

const kassererSider = {
  oversikt: { meny: "Oversikt", ikon: "📊", side: oversikt.oversikt },
  poster: { meny: "Poster", ikon: "🧾", side: poster.liste },
  post: { side: poster.skjema },
  soknader: { meny: "Søknader", ikon: "📥", side: soknader.kassererListe },
  soknad: { side: soknader.kassererDetalj },
  medlemmer: { meny: "Medlemmer", ikon: "👥", side: medlemmer.liste },
  medlem: { side: medlemmer.skjema },
  rapport: { meny: "Årsrapport", ikon: "📄", side: rapport.rapport },
  innstillinger: { meny: "Innstillinger", ikon: "⚙️", side: innstillinger.innstillinger },
  mine: { side: soknader.mineListe },
  "ny-soknad": { side: soknader.nySoknad },
  "min-soknad": { side: soknader.minDetalj },
};

const medlemSider = {
  mine: { meny: "Mine søknader", ikon: "📥", side: soknader.mineListe },
  "ny-soknad": { meny: "Ny søknad", ikon: "➕", side: soknader.nySoknad },
  "min-soknad": { side: soknader.minDetalj },
  minside: { meny: "Min side", ikon: "👤", side: minside.minside },
};

const erKasserer = () => S.profil?.rolle === "kasserer";
const sider = () => (erKasserer() ? kassererSider : medlemSider);
const startside = () => (erKasserer() ? "oversikt" : "mine");

export function gaaTil(sti) {
  if (location.hash === `#/${sti}`) tegn();
  else location.hash = `#/${sti}`;
}

function lesSti() {
  const [navn, ...rest] = location.hash.replace(/^#\/?/, "").split("/");
  return { navn: navn || startside(), param: rest.join("/") || null };
}

// ---------- Tegning ----------

let planlagt = false;
/** Tegner siden på nytt når data endrer seg, men bare sider som tåler det (ikke skjemaer under utfylling). */
function dataEndret() {
  if (planlagt) return;
  planlagt = true;
  requestAnimationFrame(() => {
    planlagt = false;
    if (!S.bruker) return;
    if (!gjeldendeSide || gjeldendeSide.live || gjeldendeSide.venter) tegn();
    else tegnMeny();
  });
}

function tegn() {
  if (!klar) return innlogging.ikkeKonfigurert(main);
  if (!S.bruker) { tegnMeny(); return innlogging.loggInn(main); }
  if (!S.bruker.emailVerified) { tegnMeny(); return innlogging.bekreftEpost(main, S); }
  if (S.profil === undefined) { tegnMeny(); return venter(); }
  if (S.profil === null) { tegnMeny(); return innlogging.ingenTilgang(main, S); }

  const { navn, param } = lesSti();
  const oppslag = sider()[navn];
  if (!oppslag) return gaaTil(startside());

  const side = oppslag.side;
  const trenger = side.trenger || [];
  const mangler = trenger.filter((t) => !S.lastet.has(t));
  tegnMeny(navn);
  if (mangler.length) {
    gjeldendeSide = { live: false, venter: true };
    return venter();
  }
  gjeldendeSide = { live: Boolean(side.live), venter: false };
  document.title = `${side.tittel ? side.tittel + " · " : ""}${S.innst.kortnavn || "TPTHK"}`;
  main.scrollTop = 0;
  side(main, S, param);
}

function venter() {
  main.innerHTML = `<div class="laster"><div class="spinner"></div></div>`;
}

function tegnMeny(aktiv) {
  document.getElementById("rolle").textContent = S.profil ? (S.profil.admin ? "admin" : erKasserer() ? "kasserer" : "medlem") : "";
  if (!S.bruker || !S.profil) {
    meny.innerHTML = "";
    topp.innerHTML = S.bruker ? html`<button class="lenkeknapp" id="loggut">Logg ut</button>` : "";
    topp.querySelector("#loggut")?.addEventListener("click", () => konto.loggUt());
    document.body.classList.remove("har-meny");
    return;
  }
  document.body.classList.add("har-meny");
  const s = sider();
  meny.innerHTML = Object.entries(s).filter(([, v]) => v.meny).map(([k, v]) => {
    const merke = k === "soknader" ? S.soknader.filter((x) => x.status === "sendt").length
      : k === "medlemmer" ? S.foresporsler.length : 0;
    return html`<a href="#/${k}" class="${k === aktiv || (s[aktiv] && !s[aktiv].meny && hører(aktiv) === k) ? "aktiv" : ""}">
      <span class="ikon" aria-hidden="true">${v.ikon}</span><span>${v.meny}</span>${merke ? raw(`<span class="merke">${merke}</span>`) : ""}
    </a>`;
  }).join("");

  const aarValg = erKasserer()
    ? html`<label class="aarvalg"><span class="skjult">Regnskapsår</span><select id="aar">${tilgjengeligeAar(S.poster).map((a) => raw(html`<option ${a === S.aar ? "selected" : ""}>${a}</option>`))}</select></label>`
    : "";
  topp.innerHTML = aarValg + html`<button class="lenkeknapp" id="loggut" title="${S.bruker.email}">Logg ut</button>`;
  topp.querySelector("#loggut").addEventListener("click", () => konto.loggUt());
  topp.querySelector("#aar")?.addEventListener("change", (e) => { S.aar = Number(e.target.value); tegn(); });
}

// Undersider markerer menypunktet de hører til.
const hører = (navn) => ({ post: "poster", soknad: "soknader", medlem: "medlemmer", "ny-soknad": "mine", "min-soknad": "mine" })[navn];

// ---------- Data ----------

function stopp() {
  stoppLyttere.forEach((f) => f());
  stoppLyttere = [];
}

const visFeil = (e) => {
  console.error(e);
  if (e.code === "permission-denied") return; // skjer et øyeblikk når tilgang endres
  main.insertAdjacentHTML("afterbegin", html`<div class="varsel feil">Klarte ikke å hente data: ${e.message}</div>`);
};

function startLyttere() {
  stopp();
  S.lastet = new Set();
  const lyttere = [];

  // Profilen (rolle) styrer hva vi ellers lytter på.
  let rolle;
  lyttere.push(lyttProfil((p) => {
    S.profil = p;
    if (p?.rolle !== rolle) {
      rolle = p?.rolle;
      startRolleLyttere();
    }
    dataEndret();
  }, visFeil));
  lyttere.push(lyttMinForesporsel((f) => { S.foresporsel = f; dataEndret(); }, () => {}));
  stoppProfil = () => lyttere.forEach((f) => f());
}

let stoppProfil = () => {};

function startRolleLyttere() {
  stopp();
  S.lastet = new Set();
  const sett = (felt, navn = felt) => (data) => { S[felt] = data; S.lastet.add(navn); dataEndret(); };
  const r = S.profil?.rolle;
  if (!r) return;

  stoppLyttere.push(lyttDokument("innstillinger", "medlemsinfo", (d) => sett("info")(d || {}), visFeil));
  stoppLyttere.push(lyttMineSoknader(sett("mineSoknader"), visFeil));
  if (S.profil.medlemId) {
    stoppLyttere.push(lyttDokument("medlemmer", S.profil.medlemId, sett("mittMedlem"), visFeil));
  } else {
    S.mittMedlem = null;
    S.lastet.add("mittMedlem");
  }

  if (r === "kasserer") {
    stoppLyttere.push(lyttSamling("poster", sett("poster"), visFeil));
    stoppLyttere.push(lyttSamling("medlemmer", sett("medlemmer"), visFeil));
    stoppLyttere.push(lyttSamling("soknader", sett("soknader"), visFeil));
    stoppLyttere.push(lyttSamling("brukere", sett("brukere"), visFeil));
    stoppLyttere.push(lyttSamling("foresporsler", sett("foresporsler"), visFeil));
    stoppLyttere.push(lyttDokument("innstillinger", "klubb", (d) => { S.innst = medStandard(d); S.lastet.add("innst"); dataEndret(); }, visFeil));
  }
}

// ---------- Oppstart ----------

window.addEventListener("hashchange", tegn);

if (klar) {
  konto.vedEndring((bruker) => {
    stopp();
    stoppProfil();
    Object.assign(S, {
      bruker, profil: undefined, foresporsel: null, poster: [], medlemmer: [], soknader: [], mineSoknader: [],
      brukere: [], foresporsler: [], innst: medStandard(null), info: {}, mittMedlem: null, lastet: new Set(),
    });
    if (bruker?.emailVerified) startLyttere();
    tegn();
  });
} else {
  tegn();
}

// Lar «Jeg har bekreftet»-knappen starte på nytt etter at e-posten er bekreftet.
export function startPaaNytt() {
  S.bruker = auth.currentUser;
  if (S.bruker?.emailVerified) startLyttere();
  tegn();
}

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

export { normalEpost, esc };
