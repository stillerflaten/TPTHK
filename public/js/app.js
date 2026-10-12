// Hovedfila: holder styr på hvem som er logget inn, henter data og bytter mellom sidene.

import {
  klar, auth, konto, lyttProfil, lyttSamling, lyttDokument, lyttMineSoknader, lyttMinForesporsel, normalEpost,
  lagrePersonliste, lyttSupport, lagreVerv,
} from "./firebase.js";
import { html, raw, esc, aarNaa } from "./util.js";
import { medStandard, tilgjengeligeAar, nummererBilag } from "./regnskap.js";
import * as innlogging from "./views/innlogging.js";
import * as oversikt from "./views/oversikt.js";
import * as poster from "./views/poster.js";
import * as rapport from "./views/rapport.js";
import { budsjett } from "./views/budsjett.js";
import * as soknader from "./views/soknader.js";
import * as medlemmer from "./views/medlemmer.js";
import * as innstillinger from "./views/innstillinger.js";
import * as minside from "./views/minside.js";
import * as moter from "./views/moter.js";
import * as styret from "./views/styret.js";
import { hjelp } from "./views/hjelp.js";
import { personvern } from "./views/personvern.js";
import { ikon } from "./ikoner.js";
import { erKasserer as kasserer, erStyret, supportAktiv, harVerv, erAdmin, erRevisor, eksternRevisor, revisorUtloper, seRegnskap as kanSeRegnskap } from "./tilgang.js";
import { supportStripe, oppdaterSupportKort } from "./views/support.js";

const main = document.getElementById("innhold");
const meny = document.getElementById("meny");
const topp = document.getElementById("topp-hoyre");

/** Alt appen vet akkurat nå. Sidene leser herfra. */
export const S = {
  bruker: null,
  profil: undefined, // undefined = ikke lastet, null = finnes ikke (ingen tilgang)
  foresporsel: null,
  poster: [], medlemmer: [], soknader: [], brukere: [], foresporsler: [],
  moter: [], signaturer: [], personer: [],
  support: null,
  verv: undefined, // undefined = ikke lastet, null = ikke opprettet ennå
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
  oversikt: { meny: "Oversikt", ikon: "oversikt", side: oversikt.oversikt },
  poster: { meny: "Poster", ikon: "poster", side: poster.liste },
  post: { side: poster.skjema },
  soknader: { meny: "Søknader", ikon: "soknader", side: soknader.kassererListe },
  soknad: { side: soknader.kassererDetalj },
  medlemmer: { meny: "Medlemmer", ikon: "medlemmer", side: medlemmer.liste },
  medlem: { side: medlemmer.skjema },
  rapport: { meny: "Årsrapport", ikon: "rapport", side: rapport.rapport },
  budsjett: { side: budsjett },
  moter: { meny: "Møter", ikon: "moter", side: moter.liste },
  innstillinger: { meny: "Innstillinger", ikon: "innstillinger", side: innstillinger.innstillinger },
  mine: { side: soknader.mineListe },
  "ny-soknad": { side: soknader.nySoknad },
  "min-soknad": { side: soknader.minDetalj },
};

// Møter og referater: felles for alle. Hva man kan endre, styres av om man sitter i styret.
const moteSider = {
  mote: { side: moter.detalj },
  "mote-skjema": { side: moter.skjema },
  referat: { side: moter.referat },
  styret: { side: styret.styret },
  hjelp: { side: hjelp },
};
Object.assign(kassererSider, moteSider);

const medlemSider = {
  mine: { meny: "Mine søknader", ikon: "soknader", side: soknader.mineListe },
  "ny-soknad": { meny: "Ny søknad", ikon: "ny", side: soknader.nySoknad },
  "min-soknad": { side: soknader.minDetalj },
  moter: { meny: "Møter", ikon: "moter", side: moter.liste },
  ...moteSider,
  minside: { meny: "Min side", ikon: "person", side: minside.minside },
};

// Styret ser regnskapet, årsrapporten med budsjett og søknadene, men kan ikke endre dem.
const styreSider = {
  oversikt: { meny: "Oversikt", ikon: "oversikt", side: oversikt.oversikt },
  rapport: { meny: "Årsrapport", ikon: "rapport", side: rapport.rapport },
  soknader: { meny: "Søknader", ikon: "soknader", side: soknader.kassererListe },
  soknad: { side: soknader.kassererDetalj },
  mine: { meny: "Mine søknader", ikon: "poster", side: soknader.mineListe },
  "ny-soknad": { side: soknader.nySoknad },
  "min-soknad": { side: soknader.minDetalj },
  moter: { meny: "Møter", ikon: "moter", side: moter.liste },
  ...moteSider,
  minside: { meny: "Min side", ikon: "person", side: minside.minside },
};

// Revisor leser regnskapet med bilag, kvitteringer og årsrapport, men endrer ingenting.
// Sitter revisoren også i styret, ser hen søknadene i tillegg.
const revisorSider = (styre) => ({
  oversikt: { meny: "Oversikt", ikon: "oversikt", side: oversikt.oversikt },
  poster: { meny: "Poster", ikon: "poster", side: poster.liste },
  post: { side: poster.visning },
  rapport: { meny: "Årsrapport", ikon: "rapport", side: rapport.rapport },
  ...(styre ? { soknader: styreSider.soknader, soknad: styreSider.soknad } : {}),
  mine: { meny: "Mine søknader", ikon: "soknader", side: soknader.mineListe },
  "ny-soknad": { side: soknader.nySoknad },
  "min-soknad": { side: soknader.minDetalj },
  moter: { meny: "Møter", ikon: "moter", side: moter.liste },
  ...moteSider,
  minside: { meny: "Min side", ikon: "person", side: minside.minside },
});

// Revisor utenfor klubben: bare regnskapet og hjelp.
const eksternRevisorSider = {
  oversikt: { meny: "Oversikt", ikon: "oversikt", side: oversikt.oversikt },
  poster: { meny: "Poster", ikon: "poster", side: poster.liste },
  post: { side: poster.visning },
  rapport: { meny: "Årsrapport", ikon: "rapport", side: rapport.rapport },
  hjelp: { side: hjelp },
};

const erKasserer = () => kasserer(S);
const seRegnskap = () => kanSeRegnskap(S);
const sider = () => (eksternRevisor(S) ? (erRevisor(S) ? eksternRevisorSider : {})
  : erKasserer() ? kassererSider : erRevisor(S) ? revisorSider(erStyret(S)) : erStyret(S) ? styreSider : medlemSider);
const startside = () => (seRegnskap() ? "oversikt" : "mine");

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
    oppdaterPersonliste();
    opprettVerv();
    if (!gjeldendeSide || gjeldendeSide.live || gjeldendeSide.venter) tegn();
    else { tegnMeny(lesSti().navn); oppdaterSupportKort(main, S); }
  });
}

function tegn() {
  if (!klar) return innlogging.ikkeKonfigurert(main);
  // Personvernerklæringen skal kunne leses uten å logge inn.
  if (location.hash.startsWith("#/personvern")) {
    gjeldendeSide = { live: false, venter: false };
    tegnMeny("personvern");
    document.title = `Personvern · ${S.innst.kortnavn || "TPTHK"}`;
    return personvern(main, S);
  }
  if (!S.bruker) { tegnMeny(); return innlogging.loggInn(main); }
  if (!S.bruker.emailVerified) { tegnMeny(); return innlogging.bekreftEpost(main, S); }
  if (S.profil === undefined) { tegnMeny(); return venter(); }
  if (S.profil === null) { tegnMeny(); return innlogging.ingenTilgang(main, S); }
  if (eksternRevisor(S) && !erRevisor(S)) { tegnMeny(); return innlogging.revisorUtlopt(main, S); }

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
  const stripe = supportStripe(S, erKasserer() ? "innstillinger" : "minside");
  if (stripe && navn !== "innstillinger" && navn !== "minside") main.insertAdjacentHTML("afterbegin", stripe);
}

function venter() {
  main.innerHTML = `<div class="laster"><div class="spinner"></div></div>`;
}

const hjelpLenke = () => `<a class="utlogg" href="#/hjelp" title="Hjelp" aria-label="Hjelp">${ikon("hjelp")}<span>Hjelp</span></a>`;
const utloggKnapp = () =>
  html`<button class="utlogg" id="loggut" title="Logg ut ${S.bruker.email}">${raw(ikon("utlogg"))}<span>Logg ut</span></button>`;

function tegnMeny(aktiv) {
  document.getElementById("rolle").textContent = S.profil ? (S.profil.admin ? (supportAktiv(S) ? "support" : "admin") : erKasserer() ? "kasserer" : harVerv(S) ? "styret" : erRevisor(S) ? "revisor" : "medlem") : "";
  if (!S.bruker || !S.profil || !Object.keys(sider()).length) {
    meny.innerHTML = "";
    topp.innerHTML = S.bruker ? utloggKnapp() : "";
    topp.querySelector("#loggut")?.addEventListener("click", () => konto.loggUt());
    document.body.classList.remove("har-meny");
    document.body.classList.add("ute");
    return;
  }
  document.body.classList.add("har-meny");
  document.body.classList.remove("ute");
  const s = sider();
  meny.innerHTML = Object.entries(s).filter(([, v]) => v.meny).map(([k, v]) => {
    const merke = k === "soknader" ? S.soknader.filter((x) => x.status === "sendt").length
      : k === "medlemmer" ? S.foresporsler.length
      : k === "moter" && S.lastet.has("signaturer") ? moter.venterPaaMeg(S).length : 0;
    return html`<a href="#/${k}" class="${k === aktiv || (s[aktiv] && !s[aktiv].meny && hører(aktiv) === k) ? "aktiv" : ""}">
      ${raw(ikon(v.ikon))}<span class="meny-tekst">${v.meny}</span>${merke ? raw(`<span class="merke">${merke}</span>`) : ""}
    </a>`;
  }).join("") + `<div class="meny-fot">${ikon("stjerne")}<span>Trøndelag Politis<br>Tjenestehundklubb · 1952</span></div>`;

  const aarValg = seRegnskap()
    ? html`<label class="aarvalg"><span class="skjult">Regnskapsår</span><select id="aar">${tilgjengeligeAar(S.poster, [S.aar, ...Object.keys(S.innst.budsjett || {}).map(Number)]).map((a) => raw(html`<option ${a === S.aar ? "selected" : ""}>${a}</option>`))}</select></label>`
    : "";
  topp.innerHTML = aarValg + hjelpLenke() + utloggKnapp();
  topp.querySelector("#loggut").addEventListener("click", () => konto.loggUt());
  topp.querySelector("#aar")?.addEventListener("change", (e) => { S.aar = Number(e.target.value); tegn(); });
}

// Undersider markerer menypunktet de hører til.
const hører = (navn) => ({ post: "poster", soknad: "soknader", medlem: "medlemmer", "ny-soknad": "mine", "min-soknad": "mine",
  mote: "moter", "mote-skjema": "moter", referat: "moter", styret: "moter", budsjett: "rapport" })[navn];

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

  // Profilen (rolle) og support styrer hva vi ellers lytter på.
  // Supportstatus kan bare leses av dem som har tilgang, så den lyttes på først når profilen finnes.
  rolle = undefined;
  let stoppSupport = null;
  let stoppVerv = null;
  lyttere.push(lyttProfil((p) => {
    S.profil = p;
    // En revisor utenfor klubben har ikke tilgang til support eller styreverv.
    if (p?.rolle === "revisor") {
      stoppSupport?.(); stoppSupport = null; S.support = null;
      stoppVerv?.(); stoppVerv = null; S.verv = null;
    } else if (p && !stoppSupport) {
      stoppSupport = lyttSupport((s) => { S.support = s; vurderRolle(); dataEndret(); }, () => { stoppSupport = null; });
    } else if (!p && stoppSupport) {
      stoppSupport();
      stoppSupport = null;
      S.support = null;
    }
    // Styrevervene avgjør hvem som er i styret, så de lyttes på sammen med profilen.
    if (p?.rolle === "revisor") {
      // se over
    } else if (p && !stoppVerv) {
      stoppVerv = lyttDokument("innstillinger", "verv", (v) => { S.verv = v; S.lastet.add("verv"); vurderRolle(); dataEndret(); }, () => { stoppVerv = null; });
    } else if (!p && stoppVerv) {
      stoppVerv();
      stoppVerv = null;
      S.verv = undefined;
    }
    vurderRolle();
    dataEndret();
  }, visFeil));
  lyttere.push(() => stoppSupport?.());
  lyttere.push(() => stoppVerv?.());
  lyttere.push(lyttMinForesporsel((f) => { S.foresporsel = f; dataEndret(); }, () => {}));
  stoppProfil = () => lyttere.forEach((f) => f());
}

let stoppProfil = () => {};

// Når rollen endrer seg (også når support starter eller går ut), byttes datalytterne.
let rolle;
let supportTimer = null;
function vurderRolle() {
  const ny = S.profil ? `${S.profil.rolle}|${erKasserer()}|${erStyret(S)}|${erRevisor(S)}` : undefined;
  if (ny !== rolle) {
    rolle = ny;
    gjeldendeSide = null; // tegn siden på nytt, menyen og sidene er annerledes nå
    startRolleLyttere();
  }
  // Vekk appen når support eller revisortilgangen går ut, så menyen og dataene forsvinner av seg selv.
  clearTimeout(supportTimer);
  const utloper = [
    S.support && !S.support.avsluttet ? S.support.utloper : null,
    S.profil?.revisor === true ? revisorUtloper(S.profil) : null,
  ].filter((t) => t && t > Date.now());
  if (utloper.length) {
    supportTimer = setTimeout(() => { vurderRolle(); dataEndret(); }, Math.min(Math.min(...utloper) - Date.now() + 1000, 2 ** 31 - 1));
  }
}

function startRolleLyttere() {
  stopp();
  S.lastet = new Set();
  const sett = (felt, navn = felt) => (data) => { S[felt] = data; S.lastet.add(navn); dataEndret(); };
  if (S.verv !== undefined) S.lastet.add("verv");
  if (!S.profil?.rolle) return;
  // Revisor utenfor klubben: bare regnskapet.
  if (eksternRevisor(S)) {
    S.lastet.add("soknader"); S.lastet.add("foresporsler"); S.lastet.add("verv");
    if (!erRevisor(S)) return;
    stoppLyttere.push(lyttSamling("poster", (p) => sett("poster")(nummererBilag(p)), visFeil));
    stoppLyttere.push(lyttSamling("medlemmer", sett("medlemmer"), visFeil));
    stoppLyttere.push(lyttDokument("innstillinger", "klubb", (d) => { S.innst = medStandard(d); S.lastet.add("innst"); dataEndret(); }, visFeil));
    return;
  }

  stoppLyttere.push(lyttDokument("innstillinger", "medlemsinfo", (d) => sett("info")(d || {}), visFeil));
  stoppLyttere.push(lyttMineSoknader(sett("mineSoknader"), visFeil));
  if (S.profil.medlemId) {
    stoppLyttere.push(lyttDokument("medlemmer", S.profil.medlemId, sett("mittMedlem"), visFeil));
  } else {
    S.mittMedlem = null;
    S.lastet.add("mittMedlem");
  }

  stoppLyttere.push(lyttSamling("moter", sett("moter"), visFeil));
  stoppLyttere.push(lyttSamling("signaturer", sett("signaturer"), visFeil));
  if (moter.erStyret(S) || erAdmin(S)) {
    stoppLyttere.push(lyttDokument("innstillinger", "personer", (d) => sett("personer")(d?.liste || []), visFeil));
  } else {
    S.personer = [];
    S.lastet.add("personer");
  }

  if (seRegnskap()) {
    stoppLyttere.push(lyttSamling("poster", (p) => sett("poster")(nummererBilag(p)), visFeil));
    stoppLyttere.push(lyttSamling("medlemmer", sett("medlemmer"), visFeil));
    // Revisor ser ikke søknadene (der står medlemmenes kontonumre), med mindre hen også sitter i styret.
    if (erStyret(S)) stoppLyttere.push(lyttSamling("soknader", sett("soknader"), visFeil));
    else { S.soknader = []; S.lastet.add("soknader"); }
    stoppLyttere.push(lyttDokument("innstillinger", "klubb", (d) => { S.innst = medStandard(d); S.lastet.add("innst"); dataEndret(); }, visFeil));
  }
  if (erKasserer()) {
    stoppLyttere.push(lyttSamling("brukere", sett("brukere"), visFeil));
    stoppLyttere.push(lyttSamling("foresporsler", sett("foresporsler"), visFeil));
  } else {
    S.brukere = [];
    S.foresporsler = [];
    S.lastet.add("foresporsler");
  }
}

/**
 * Styret kan ikke lese «brukere» (der ligger blant annet kontonumre), men trenger navn og e-post
 * for å velge hvem som skal signere referater. Kassereren holder derfor en kort liste oppdatert.
 */
let sistePersonliste = null;
function oppdaterPersonliste() {
  if (!erKasserer() || !S.lastet.has("brukere") || !S.lastet.has("personer") || !S.lastet.has("verv")) return;
  const liste = S.brukere
    .filter((b) => b.rolle !== "revisor")
    .map((b) => ({ epost: b.id, navn: b.navn || "", styre: (S.verv?.styre || []).includes(b.id) || (b.rolle === "kasserer" && !b.admin) }))
    .sort((a, b) => a.epost.localeCompare(b.epost));
  const ny = JSON.stringify(liste);
  const naa = JSON.stringify(S.personer.map((p) => ({ epost: p.epost, navn: p.navn, styre: p.styre }))
    .sort((a, b) => a.epost.localeCompare(b.epost)));
  if (ny === naa || ny === sistePersonliste) return;
  sistePersonliste = ny;
  lagrePersonliste(liste).catch(visFeil);
}

/**
 * Første gang kassereren eller administratoren logger inn, lagres standardvervene.
 * De som var merket «Sitter i styret» fra før (styre: true), blir styremedlemmer.
 */
let vervOpprettet = false;
function opprettVerv() {
  if (vervOpprettet || S.verv !== null || !S.lastet.has("verv")) return;
  if (!erKasserer() || !S.lastet.has("brukere")) return;
  vervOpprettet = true;
  const tidligere = S.brukere.filter((b) => b.styre === true).map((b) => b.id);
  const data = styret.byggVerv(styret.STANDARDVERV, tidligere.length ? { styremedlem: tidligere } : {},
    S.brukere.map((b) => ({ epost: b.id, navn: b.navn || "" })));
  lagreVerv(data).catch((e) => { vervOpprettet = false; visFeil(e); });
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
      moter: [], signaturer: [], personer: [], support: null, verv: undefined,
    });
    vervOpprettet = false;
    rolle = undefined;
    clearTimeout(supportTimer);
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
