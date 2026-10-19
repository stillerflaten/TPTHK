// Fôrbestilling: medlemmene bestiller fôr (Royal Canin) gjennom klubben i bestillingsrunder.
// Fôransvarlig legger inn fôrtypene, åpner og stenger rundene, ser en samlet liste til bestillingen
// og holder oversikt over pris, Vippskrav og betaling. Betalingen går ikke via klubben, så ingenting her
// havner i regnskapet. Kassereren eller administratoren velger hvem som er fôransvarlig.

import { html, raw, kr, datoTekst, iDag, tolkBelop, belopTilInput } from "../util.js";
import {
  normalEpost, lagreForInnstillinger, sendForbestilling, endreForbestilling, slettForbestilling,
  varsleOmForbestilling, stengForrunde, aapneForrunde, sendForbeskjed, lagreForabonnement, meldAvFor,
} from "../firebase.js";
import { melding, medKnapp, bekreft } from "../ui.js";
import { ikon } from "../ikoner.js";
import { styrerFor, kanVelgeForansvarlig } from "../tilgang.js";

const MAKS_ANTALL = 99;

/** Innstillingene for fôrbestilling, med tomme standardverdier hvis ingenting er lagret ennå. */
export function forData(S) {
  const f = S.forInnst || {};
  return {
    ansvarlige: f.ansvarlige || [], navn: f.navn || {}, varer: f.varer || [], info: f.info || "",
    varsel: f.varsel !== false, runde: f.runde || "", aapen: f.aapen === true, frist: f.frist || "", stengt: f.stengt || "",
    neste: f.neste || "",
  };
}

const rundeTekst = (runde) => (runde ? `Runden fra ${datoTekst(runde.slice(0, 10))}` : "");
const linjeTekst = (l) => `${l.antall} × ${l.navn}`;
const statusTekst = { ny: "Mottatt", bestilt: "Bestilt", levert: "Levert" };
const statusKlasse = { ny: "sendt", bestilt: "godkjent", levert: "utbetalt" };
const statusMerke = (b) => html`<span class="status status-${statusKlasse[b.status] || "sendt"}">${statusTekst[b.status] || b.status}</span>`;
const tid = (b) => b.opprettet?.toMillis?.() ?? Date.now();

/** Antall ubehandlede bestillinger i den åpne runden, til tallet i menyen. */
export function nyeBestillinger(S) {
  const F = forData(S);
  return F.aapen ? (S.forbestillinger || []).filter((b) => b.runde === F.runde && b.status === "ny").length : 0;
}

// Det medlemmet har skrevet i et skjema som ikke er lagret ennå. Siden tegnes på nytt når data endrer seg,
// og da skal ikke det som er skrevet, forsvinne.
const skjemaUtkast = {};
function huskSkjema(main, id, nokkel) {
  const f = main.querySelector(`#${id}`);
  if (!f) return;
  const u = skjemaUtkast[id];
  if (u && u.nokkel === nokkel) {
    for (const [navn, verdi] of Object.entries(u.verdier)) if (f.elements[navn]) f.elements[navn].value = verdi;
  }
  f.addEventListener("input", () => { skjemaUtkast[id] = { nokkel, verdier: Object.fromEntries(new FormData(f)) }; });
}
const glemSkjema = (id) => { delete skjemaUtkast[id]; };

/** Antall-feltene for hver fôrtype, brukt både i bestillingen og i den faste bestillingen. */
function antallFelter(varer, antallFor) {
  return html`<ul class="enkel-liste forvarer">${varer.map((v) => raw(html`
    <li>
      <span><strong>${v.navn}</strong>${v.pris ? raw(html`<span class="hint blokk">Ca. ${kr(v.pris)}</span>`) : ""}</span>
      <input type="number" name="${v.id}" min="0" max="${MAKS_ANTALL}" step="1" inputmode="numeric" value="${antallFor(v.id)}"
        placeholder="0" aria-label="Antall ${v.navn}">
    </li>`))}
  </ul>`;
}

/** Leser antall-feltene. Gir varelinjene, eller null (med feilmelding) hvis noe er feil. */
function lesLinjer(varer, v) {
  const linjer = [];
  for (const vare of varer) {
    const antall = Number(v[vare.id] || 0);
    if (!Number.isInteger(antall) || antall < 0 || antall > MAKS_ANTALL) {
      melding(`Antallet for ${vare.navn} må være et helt tall fra 0 til ${MAKS_ANTALL}.`, "feil");
      return null;
    }
    if (antall) linjer.push({ vare: vare.id, navn: vare.navn, antall });
  }
  return linjer;
}

/** Den faste bestillingen med navnene fôrtypene har nå. Fôrtyper som er fjernet, tas ut. */
export function gjeldendeFast(fast, varer) {
  return (fast || []).map((l) => {
    const v = varer.find((x) => x.id === l.vare);
    return v ? { vare: v.id, navn: v.navn, antall: l.antall } : null;
  }).filter(Boolean);
}

function betaling(b) {
  if (b.belop == null) return "";
  return html` · ${kr(b.belop)} · ${b.betalt ? "betalt" : b.vippsSendt ? "Vippskrav sendt" : "ikke betalt ennå"}`;
}

// ---------- Medlemmet ----------

export function forside(main, S) {
  const F = forData(S);
  const meg = normalEpost(S.bruker.email);
  const mine = [...(S.mineFor || [])].sort((a, b) => tid(b) - tid(a));
  const iRunden = F.aapen ? mine.find((b) => b.runde === F.runde && b.status === "ny") : null;
  const antallFor = (vareId) => iRunden?.linjer.find((l) => l.vare === vareId)?.antall || "";
  const ansvarligNavn = F.ansvarlige.map((e) => F.navn[e] || e);

  main.innerHTML = html`
    <div class="sidetopp">
      <h1>Fôrbestilling</h1>
      ${styrerFor(S) ? raw(`<a class="knapp" href="#/for-alle">Alle bestillinger</a>`) : ""}
    </div>

    <section class="kort">
      ${ansvarligNavn.length ? raw(html`<p>Fôransvarlig: <strong>${ansvarligNavn.join(", ")}</strong></p>`)
        : raw(`<p class="hint">Det er ikke valgt noen fôransvarlig ennå.</p>`)}
      ${F.info ? raw(html`<p class="fritekst">${F.info}</p>`) : ""}
      <p class="hint">Betalingen går ikke via klubben. Når regningen kommer, får du Vippskrav fra fôransvarlig.</p>
    </section>

    ${!F.aapen ? raw(html`<div class="tom">Det er ingen åpen bestillingsrunde nå.
        ${F.neste && F.neste >= iDag() ? `Neste runde er planlagt ${datoTekst(F.neste)}.` : "Fôransvarlig gir beskjed når neste runde åpner."}</div>`)
      : !F.varer.length ? raw(`<div class="tom">Bestillingsrunden er åpen, men fôransvarlig har ikke lagt inn fôrtyper ennå.</div>`)
      : raw(html`
      <form id="bestill" class="skjema kort uthevet">
        <h2>${iRunden ? (iRunden.fast ? "Din bestilling (fra den faste bestillingen)" : "Din bestilling") : "Ny bestilling"}</h2>
        <p class="hint">${F.frist ? `Bestillingsfrist ${datoTekst(F.frist)}. ` : ""}Skriv antall ved det du vil ha. ${iRunden ? "Du kan endre bestillingen helt til runden stenges." : ""}</p>
        ${raw(antallFelter(F.varer, antallFor))}
        <label>Kommentar til fôransvarlig (valgfritt)<textarea name="kommentar" rows="2" maxlength="500">${iRunden?.kommentar || ""}</textarea></label>
        <div class="knapper">
          ${iRunden ? raw(`<button type="button" class="knapp farlig sekundaer" id="trekk">Trekk bestillingen</button>`) : ""}
          <button type="submit" class="knapp">${iRunden ? "Lagre endringer" : "Send bestilling"}</button>
        </div>
      </form>`)}

    ${raw(ordningKort(S, F))}

    <h2 class="seksjonstittel">Mine bestillinger</h2>
    ${mine.length ? raw(html`<ul class="postliste forliste">${mine.map((b) => raw(html`
      <li><div class="forrad">
        <span class="post-tekst">
          <span>${b.linjer.map(linjeTekst).join(", ")}</span>
          <span class="post-kategori">${rundeTekst(b.runde)} · ${raw(statusMerke(b))}${raw(betaling(b))}</span>
        </span>
      </div></li>`))}</ul>`)
      : raw(`<div class="tom">Du har ikke bestilt noe ennå.</div>`)}

    ${kanVelgeForansvarlig(S) ? raw(velgAnsvarligKort(S, F)) : ""}`;

  const skjema = main.querySelector("#bestill");
  skjema?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(skjema));
    const linjer = lesLinjer(F.varer, v);
    if (!linjer) return;
    if (!linjer.length) return melding("Skriv antall ved minst én fôrtype.", "feil");
    const kommentar = String(v.kommentar || "").trim().slice(0, 500);
    await medKnapp(e.submitter, async () => {
      if (iRunden) {
        await endreForbestilling(iRunden.id, { linjer, kommentar });
        glemSkjema("bestill");
        melding("Bestillingen er endret.");
      } else {
        await sendForbestilling({ navn: S.profil.navn || meg, runde: F.runde, linjer, kommentar });
        if (F.varsel && F.ansvarlige.length && !(F.ansvarlige.length === 1 && F.ansvarlige[0] === meg)) {
          await varsleOmForbestilling(F.ansvarlige).catch(() => {});
        }
        glemSkjema("bestill");
        melding("Bestillingen er sendt.");
      }
    });
  });
  main.querySelector("#trekk")?.addEventListener("click", async (e) => {
    if (!(await bekreft("Trekke bestillingen din i denne runden?", { ja: "Trekk", farlig: true }))) return;
    await medKnapp(e.currentTarget, async () => {
      await slettForbestilling(iRunden.id);
      glemSkjema("bestill");
      melding("Bestillingen er trukket.");
    });
  });
  huskSkjema(main, "bestill", `${F.runde}|${iRunden?.id || ""}`);
  huskSkjema(main, "fast", "fast");
  kobleOrdning(main, S, F);
  kobleVelgAnsvarlig(main, S, F);
}
forside.live = true;
forside.tittel = "Fôrbestilling";
forside.trenger = ["forInnst", "mineFor", "mittForabonnement", "personer"];

// ---------- Påmelding til ordningen og fast bestilling ----------

let redigerFast = false;

function ordningKort(S, F) {
  const a = S.mittForabonnement;
  const fast = a ? gjeldendeFast(a.fast, F.varer) : [];
  if (!a) {
    return html`
      <section class="kort">
        <h2>Fast ordning</h2>
        <p>Meld deg på, så får du e-post hver gang en bestillingsrunde åpner. Du kan også ha en fast bestilling som legges inn av seg selv
          hver runde. Den kan du endre eller trekke helt til runden stenges.</p>
        <div class="knapper venstre"><button type="button" class="knapp" id="meldPaa">Meld meg på</button></div>
      </section>`;
  }
  return html`
    <section class="kort">
      <h2>Fast ordning</h2>
      <p><span class="status status-utbetalt">Påmeldt</span> Du får e-post når en bestillingsrunde åpner.</p>
      ${redigerFast ? raw(html`
        <form id="fast" class="skjema">
          <p class="hint">Skriv antall ved det du vil ha hver gang. La alt stå tomt hvis du ikke vil ha fast bestilling.</p>
          ${raw(antallFelter(F.varer, (id) => fast.find((l) => l.vare === id)?.antall || ""))}
          <div class="knapper">
            <button type="button" class="knapp sekundaer" id="avbrytFast">Avbryt</button>
            <button type="submit" class="knapp">Lagre fast bestilling</button>
          </div>
        </form>`)
      : raw(html`
        <p>${fast.length ? raw(html`Fast bestilling: <strong>${fast.map(linjeTekst).join(", ")}</strong>`) : "Du har ingen fast bestilling."}</p>
        ${fast.length ? raw(`<p class="hint">Den legges inn av seg selv når en ny runde åpner. Vil du ha noe annet en gang, endrer du bare bestillingen i runden.</p>`) : ""}
        <div class="knapper venstre">
          ${F.varer.length ? raw(`<button type="button" class="knapp sekundaer" id="endreFast">${fast.length ? "Endre fast bestilling" : "Lag fast bestilling"}</button>`) : ""}
          <button type="button" class="knapp farlig sekundaer" id="meldAv">Meld meg av</button>
        </div>`)}
    </section>`;
}

function kobleOrdning(main, S, F) {
  const meg = normalEpost(S.bruker.email);
  const tegnPaaNytt = () => forside(main, S);
  main.querySelector("#meldPaa")?.addEventListener("click", (e) => medKnapp(e.currentTarget, async () => {
    await lagreForabonnement({ navn: S.profil.navn || meg, fast: null });
    melding("Du er påmeldt.");
  }));
  main.querySelector("#meldAv")?.addEventListener("click", async (e) => {
    if (!(await bekreft("Melde deg av? Du får ikke lenger e-post om fôrbestillingen, og den faste bestillingen din slettes.", { ja: "Meld meg av" }))) return;
    await medKnapp(e.currentTarget, async () => {
      await meldAvFor();
      redigerFast = false;
      melding("Du er meldt av.");
    });
  });
  main.querySelector("#endreFast")?.addEventListener("click", () => { redigerFast = true; tegnPaaNytt(); });
  main.querySelector("#avbrytFast")?.addEventListener("click", () => { redigerFast = false; glemSkjema("fast"); tegnPaaNytt(); });
  const skjema = main.querySelector("#fast");
  skjema?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const linjer = lesLinjer(F.varer, Object.fromEntries(new FormData(skjema)));
    if (!linjer) return;
    await medKnapp(e.submitter, async () => {
      await lagreForabonnement({ navn: S.profil.navn || meg, fast: linjer.length ? linjer : null });
      redigerFast = false;
      glemSkjema("fast");
      melding(linjer.length ? "Den faste bestillingen er lagret." : "Du har ikke lenger fast bestilling.");
      tegnPaaNytt();
    });
  });
}

// ---------- Kassereren eller administratoren velger fôransvarlig ----------

function velgAnsvarligKort(S, F) {
  const personer = [...(S.personer || [])].sort((a, b) => (a.navn || a.epost).localeCompare(b.navn || b.epost, "nb"));
  return html`
    <section class="kort">
      <h2>Fôransvarlig</h2>
      <p class="hint">Fôransvarlig ser alle bestillingene og styrer bestillingsrundene. Det er ikke et styreverv, og gir ikke tilgang til regnskapet.
        Bare personer med innlogging kan velges.</p>
      <div class="brikker">
        ${F.ansvarlige.map((e) => raw(html`<span class="brikke">${F.navn[e] || e}<button type="button" class="ikonknapp" data-fjern-ansvarlig="${e}" aria-label="Fjern ${F.navn[e] || e}">${raw(ikon("lukk"))}</button></span>`))}
        <select id="nyAnsvarlig" aria-label="Legg til fôransvarlig">
          <option value="">+ Legg til fôransvarlig …</option>
          ${personer.filter((p) => !F.ansvarlige.includes(p.epost)).map((p) => raw(html`<option value="${p.epost}">${p.navn || p.epost}</option>`))}
        </select>
      </div>
    </section>`;
}

function kobleVelgAnsvarlig(main, S, F) {
  const lagre = async (ansvarlige) => {
    const navn = Object.fromEntries(ansvarlige.map((e) => [e, (S.personer || []).find((p) => p.epost === e)?.navn || F.navn[e] || e]));
    try {
      await lagreForInnstillinger({ ansvarlige, navn });
      melding("Fôransvarlig er lagret.");
    } catch (e) {
      console.error(e);
      melding("Klarte ikke å lagre fôransvarlig.", "feil");
    }
  };
  main.querySelector("#nyAnsvarlig")?.addEventListener("change", (e) => {
    if (e.target.value) lagre([...F.ansvarlige, e.target.value]);
  });
  main.querySelectorAll("[data-fjern-ansvarlig]").forEach((b) => b.addEventListener("click", () =>
    lagre(F.ansvarlige.filter((x) => x !== b.dataset.fjernAnsvarlig))));
}

// ---------- Fôransvarlig ----------

let valgtRunde = null;
let varerUtkast = null; // fôrtypene mens de redigeres

/** Summerer antall per fôrtype i en runde. */
export function samleliste(bestillinger) {
  const sum = new Map();
  for (const b of bestillinger) for (const l of b.linjer || []) {
    const n = sum.get(l.navn) || 0;
    sum.set(l.navn, n + Number(l.antall || 0));
  }
  return [...sum.entries()].map(([navn, antall]) => ({ navn, antall })).sort((a, b) => a.navn.localeCompare(b.navn, "nb"));
}

/** Prisen for en bestilling ut fra prisene på fôrtypene. null hvis en av fôrtypene mangler pris. */
export function beregnPris(b, varer) {
  let sum = 0;
  for (const l of b.linjer || []) {
    const pris = varer.find((v) => v.id === l.vare)?.pris;
    if (!pris) return null;
    sum += pris * l.antall;
  }
  return sum;
}

export function forAlle(main, S) {
  if (!styrerFor(S)) {
    main.innerHTML = `<div class="tom">Bare fôransvarlig ser alle bestillingene. <a href="#/for">Tilbake</a></div>`;
    return;
  }
  const F = forData(S);
  const alle = S.forbestillinger || [];
  const runder = [...new Set([F.runde, ...alle.map((b) => b.runde)].filter(Boolean))].sort().reverse();
  if (!runder.includes(valgtRunde)) valgtRunde = runder[0] || null;
  const iRunden = alle.filter((b) => b.runde === valgtRunde).sort((a, b) => (a.navn || "").localeCompare(b.navn || "", "nb"));
  const sum = samleliste(iRunden);
  const medPris = iRunden.filter((b) => b.belop != null);
  const betalt = iRunden.filter((b) => b.betalt);
  const erGjeldende = valgtRunde === F.runde;
  const varer = varerUtkast || F.varer.map((v) => ({ ...v }));
  const abonnenter = [...(S.forabonnenter || [])].sort((a, b) => (a.navn || a.epost).localeCompare(b.navn || b.epost, "nb"));

  // Husk hvilket felt som var i bruk, så siden kan tegnes på nytt når noen bestiller uten at du mister plassen.
  const fokus = document.activeElement?.dataset?.felt;

  main.innerHTML = html`
    <div class="sidetopp">
      <h1>Alle fôrbestillinger</h1>
      <a class="lenkeknapp" href="#/for">Til min bestilling</a>
    </div>

    <section class="kort uthevet">
      <h2>Bestillingsrunde</h2>
      ${F.aapen ? raw(html`
        <p><span class="status status-utbetalt">Åpen</span> ${rundeTekst(F.runde)}. Medlemmene kan bestille og endre bestillingene sine.</p>
        <div class="knapperad">
          <label class="liten">Bestillingsfrist (valgfritt) <input type="date" id="frist" value="${F.frist}"></label>
          <button type="button" class="knapp sekundaer liten" id="lagreFrist">Lagre frist</button>
        </div>
        <p class="hint">Når du skal sende bestillingen til Royal Canin, stenger du runden. Da kan ingen bestille eller endre mer, og alle bestillingene merkes som bestilt.</p>
        <div class="knapper venstre">
          ${abonnenter.length ? raw(`<button type="button" class="knapp sekundaer" id="paaminn">Send påminnelse til påmeldte</button>`) : ""}
          <button type="button" class="knapp" id="steng">Steng runden</button>
        </div>`)
      : raw(html`
        <p>Det er ingen åpen runde nå.${F.runde ? ` Forrige runde ble åpnet ${datoTekst(F.runde.slice(0, 10))}${F.stengt ? ` og stengt ${datoTekst(F.stengt)}` : ""}.` : ""}</p>
        ${!F.varer.length ? raw(`<p class="hint">Legg inn fôrtypene lenger ned før du åpner en runde.</p>`) : ""}
        <div class="knapperad">
          <label class="liten">Bestillingsfrist (valgfritt) <input type="date" id="frist" value=""></label>
        </div>
        <div class="knapper venstre">
          ${F.runde ? raw(`<button type="button" class="knapp sekundaer" id="gjenaapne">Åpne forrige runde igjen</button>`) : ""}
          <button type="button" class="knapp" id="aapne" ${F.varer.length ? "" : "disabled"}>Åpne ny runde</button>
        </div>`)}
    </section>

    ${runder.length ? raw(html`
      <div class="knapperad">
        <label class="liten"><span class="skjult">Velg runde</span>
          <select id="velgRunde">${runder.map((r) => raw(html`<option value="${r}" ${r === valgtRunde ? "selected" : ""}>${rundeTekst(r)}${r === F.runde && F.aapen ? " (åpen)" : ""}</option>`))}</select>
        </label>
      </div>

      <section class="kort">
        <h2>Samlet bestilling</h2>
        ${sum.length ? raw(html`
          <ul class="enkel-liste">${sum.map((s) => raw(html`<li><span>${s.navn}</span><strong>${s.antall}</strong></li>`))}</ul>
          <div class="knapper venstre"><button type="button" class="knapp sekundaer liten" id="kopier">${raw(ikon("poster"))} Kopier lista</button></div>`)
        : raw(`<p class="hint">Ingen bestillinger i denne runden ennå.</p>`)}
      </section>

      <section class="kort">
        <h2>Bestillinger (${iRunden.length})</h2>
        ${iRunden.length ? raw(html`
          <p class="hint">Når regningen kommer: skriv inn hva hver skal betale, send Vippskrav og huk av. Endringene lagres med en gang.
            ${medPris.length ? ` Totalt ${kr(medPris.reduce((t, b) => t + b.belop, 0))}, betalt ${betalt.length} av ${iRunden.length}.` : ""}</p>
          ${F.varer.some((v) => v.pris) ? raw(`<div class="knapper venstre"><button type="button" class="knapp sekundaer liten" id="beregn">Regn ut pris fra fôrtypene</button></div>`) : ""}
          <ul class="forbestillinger">${iRunden.map((b) => raw(html`
            <li data-id="${b.id}">
              <div class="forbestilling-topp">
                <strong>${b.navn}</strong> ${raw(statusMerke(b))}
                <button type="button" class="ikonknapp" data-slett="${b.id}" aria-label="Slett bestillingen til ${b.navn}">${raw(ikon("lukk"))}</button>
              </div>
              <div>${b.linjer.map(linjeTekst).join(", ")}</div>
              ${b.kommentar ? raw(html`<div class="hint fritekst">«${b.kommentar}»</div>`) : ""}
              <div class="forbestilling-felt">
                <label class="liten">Pris (kr) <input data-felt="belop-${b.id}" data-belop="${b.id}" inputmode="decimal" value="${belopTilInput(b.belop)}"></label>
                <label class="avkryss liten"><input type="checkbox" data-felt="levert-${b.id}" data-merk="levert" ${b.status === "levert" ? "checked" : ""} ${b.status === "ny" ? "disabled" : ""}> Levert</label>
                <label class="avkryss liten"><input type="checkbox" data-felt="vipps-${b.id}" data-merk="vippsSendt" ${b.vippsSendt ? "checked" : ""}> Vippskrav sendt</label>
                <label class="avkryss liten"><input type="checkbox" data-felt="betalt-${b.id}" data-merk="betalt" ${b.betalt ? "checked" : ""}> Betalt</label>
              </div>
            </li>`))}
          </ul>`)
        : raw(`<p class="hint">Ingen bestillinger i denne runden ennå.</p>`)}
      </section>`) : ""}

    <section class="kort">
      <h2>Påmeldte til ordningen (${abonnenter.length})</h2>
      <p class="hint">Medlemmene melder seg på selv på bestillingssiden. De får e-post når du åpner en runde, og den faste bestillingen
        deres legges inn av seg selv.</p>
      ${abonnenter.length ? raw(html`<ul class="enkel-liste">${abonnenter.map((a) => {
        const fast = gjeldendeFast(a.fast, F.varer);
        return raw(html`<li><span>${a.navn || a.epost}</span><span class="hint">${fast.length ? fast.map(linjeTekst).join(", ") : "Ingen fast bestilling"}</span></li>`);
      })}</ul>`) : raw(`<p class="hint">Ingen er påmeldt ennå.</p>`)}
    </section>

    <section class="kort">
      <h2>Fôrtyper</h2>
      <p class="hint">Dette er lista medlemmene velger fra. Pris er valgfritt og vises som «ca. pris». Endringer gjelder nye bestillinger, ikke de som er sendt.</p>
      <div class="forvarer-rediger">${varer.map((v, i) => raw(html`
        <div class="forvare-rad">
          <input data-vnavn="${i}" data-felt="vnavn-${i}" value="${v.navn}" placeholder="F.eks. Royal Canin Maxi Adult 15 kg" maxlength="100" aria-label="Fôrtype">
          <input data-vpris="${i}" data-felt="vpris-${i}" value="${belopTilInput(v.pris)}" placeholder="Pris" inputmode="decimal" aria-label="Pris i kroner">
          <button type="button" class="ikonknapp" data-vfjern="${i}" aria-label="Fjern ${v.navn || "fôrtypen"}">${raw(ikon("lukk"))}</button>
        </div>`))}
      </div>
      <div class="knapper">
        <button type="button" class="knapp sekundaer" id="nyVare">+ Legg til fôrtype</button>
        ${varerUtkast ? raw(`<button type="button" class="knapp sekundaer" id="avbrytVarer">Avbryt</button>`) : ""}
        <button type="button" class="knapp" id="lagreVarer" ${varerUtkast ? "" : "disabled"}>Lagre fôrtyper</button>
      </div>
    </section>

    <form id="forInnst" class="skjema kort">
      <h2>Beskjed til medlemmene og varsel</h2>
      <label>Tekst øverst på bestillingssiden (valgfritt)
        <textarea name="info" rows="3" maxlength="1000" placeholder="F.eks. Vi bestiller omtrent hver tredje måned. Vipps til Vegard når regningen kommer.">${F.info}</textarea>
      </label>
      <label>Neste planlagte runde (valgfritt)
        <input type="date" name="neste" value="${F.neste}">
        <span class="hint blokk">Vises for medlemmene når ingen runde er åpen, f.eks. de faste kvartalsdatoene.</span>
      </label>
      <label class="avkryss"><input type="checkbox" name="varsel" ${F.varsel ? "checked" : ""}> Send meg e-post når noen bestiller</label>
      <div class="knapper"><button type="submit" class="knapp">Lagre</button></div>
    </form>`;

  if (fokus) main.querySelector(`[data-felt="${fokus}"]`)?.focus();
  const tegnPaaNytt = () => forAlle(main, S);

  // Runden
  const frist = () => main.querySelector("#frist")?.value || "";
  main.querySelector("#lagreFrist")?.addEventListener("click", (e) => medKnapp(e.currentTarget, async () => {
    await lagreForInnstillinger({ frist: frist() });
    melding("Fristen er lagret.");
  }));
  main.querySelector("#steng")?.addEventListener("click", async (e) => {
    const n = alle.filter((b) => b.runde === F.runde).length;
    if (!(await bekreft(`Stenge runden? Ingen kan bestille eller endre mer, og ${n} bestilling${n === 1 ? "" : "er"} merkes som bestilt.`, { ja: "Steng runden" }))) return;
    await medKnapp(e.currentTarget, async () => {
      await stengForrunde(alle.filter((b) => b.runde === F.runde), iDag());
      melding("Runden er stengt. Bruk den samlede lista når du bestiller.");
    });
  });
  main.querySelector("#aapne")?.addEventListener("click", async (e) => {
    const faste = abonnenter.map((a) => ({ ...a, fast: gjeldendeFast(a.fast, F.varer) })).filter((a) => a.fast.length);
    const tekst = [
      "Åpne en ny bestillingsrunde?",
      abonnenter.length ? `${abonnenter.length} påmeldt${abonnenter.length === 1 ? "" : "e"} får e-post om at runden er åpen.` : "",
      faste.length ? `${faste.length} fast${faste.length === 1 ? "" : "e"} bestilling${faste.length === 1 ? "" : "er"} legges inn av seg selv.` : "",
    ].filter(Boolean).join(" ");
    if (!(await bekreft(tekst, { ja: "Åpne runden" }))) return;
    await medKnapp(e.currentTarget, async () => {
      let runde = iDag();
      for (let n = 2; runder.includes(runde); n++) runde = `${iDag()}-${n}`;
      await aapneForrunde({ runde, aapen: true, frist: frist(), stengt: "" }, faste);
      valgtRunde = runde;
      if (abonnenter.length) {
        try {
          await sendForbeskjed("aapen", abonnenter.map((a) => a.epost));
        } catch (feil) {
          console.error(feil);
          return melding("Runden er åpen, men e-posten til de påmeldte ble ikke sendt.", "feil");
        }
      }
      melding(abonnenter.length ? "Runden er åpen, og de påmeldte har fått e-post." : "Runden er åpen. Gi gjerne medlemmene beskjed.");
    });
  });
  main.querySelector("#paaminn")?.addEventListener("click", async (e) => {
    const harBestilt = new Set(alle.filter((b) => b.runde === F.runde).map((b) => b.epost));
    const mangler = abonnenter.filter((a) => !harBestilt.has(a.epost));
    if (!mangler.length) return melding("Alle påmeldte har bestilt i denne runden.");
    if (!(await bekreft(`Sende påminnelse på e-post til ${mangler.length} påmeldt${mangler.length === 1 ? "" : "e"} som ikke har bestilt ennå?`, { ja: "Send påminnelse" }))) return;
    await medKnapp(e.currentTarget, async () => {
      await sendForbeskjed("paaminnelse", mangler.map((a) => a.epost));
      melding("Påminnelsen er sendt.");
    });
  });
  main.querySelector("#gjenaapne")?.addEventListener("click", (e) => medKnapp(e.currentTarget, async () => {
    await lagreForInnstillinger({ aapen: true, frist: frist() || F.frist, stengt: "" });
    valgtRunde = F.runde;
    melding("Runden er åpen igjen. Bestillinger som var merket som bestilt, kan ikke endres av medlemmene.");
  }));
  main.querySelector("#velgRunde")?.addEventListener("change", (e) => { valgtRunde = e.target.value; tegnPaaNytt(); });

  // Samlet bestilling
  main.querySelector("#kopier")?.addEventListener("click", async () => {
    const tekst = sum.map((s) => `${s.antall} × ${s.navn}`).join("\n");
    try {
      await navigator.clipboard.writeText(tekst);
      melding("Lista er kopiert. Lim den inn i bestillingen til Royal Canin.");
    } catch {
      melding("Klarte ikke å kopiere. Merk teksten og kopier den selv.", "feil");
    }
  });

  // Hver bestilling
  const lagre = async (id, data) => {
    try { await endreForbestilling(id, data); } catch (e) { console.error(e); melding("Klarte ikke å lagre endringen.", "feil"); }
  };
  main.querySelectorAll("[data-belop]").forEach((inp) => inp.addEventListener("change", () => {
    const tekst = inp.value.trim();
    const belop = tekst ? tolkBelop(tekst) : null;
    if (tekst && (belop == null || belop < 0)) return melding("Prisen ser ikke riktig ut.", "feil");
    lagre(inp.dataset.belop, { belop });
  }));
  main.querySelectorAll("[data-merk]").forEach((boks) => boks.addEventListener("change", () => {
    const id = boks.closest("[data-id]").dataset.id;
    const felt = boks.dataset.merk;
    lagre(id, felt === "levert" ? { status: boks.checked ? "levert" : "bestilt" } : { [felt]: boks.checked });
  }));
  main.querySelectorAll("[data-slett]").forEach((b) => b.addEventListener("click", async () => {
    const best = alle.find((x) => x.id === b.dataset.slett);
    if (!(await bekreft(`Slette bestillingen til ${best?.navn || "medlemmet"}?`, { ja: "Slett", farlig: true }))) return;
    try { await slettForbestilling(b.dataset.slett); melding("Bestillingen er slettet."); } catch (e) { console.error(e); melding("Klarte ikke å slette.", "feil"); }
  }));
  main.querySelector("#beregn")?.addEventListener("click", async (e) => {
    const mangler = iRunden.filter((b) => b.belop == null);
    if (!mangler.length) return melding("Alle bestillingene har pris allerede.");
    await medKnapp(e.currentTarget, async () => {
      let n = 0;
      for (const b of mangler) {
        const pris = beregnPris(b, F.varer);
        if (pris != null) { await endreForbestilling(b.id, { belop: pris }); n++; }
      }
      melding(n === mangler.length ? "Prisen er fylt inn. Sjekk den mot regningen." : `Fylte inn pris på ${n} av ${mangler.length}. De andre har fôrtyper uten pris.`);
    });
  });

  // Fôrtyper
  const utkast = () => (varerUtkast ||= F.varer.map((v) => ({ ...v })));
  main.querySelectorAll("[data-vnavn]").forEach((inp) => inp.addEventListener("input", () => {
    const u = utkast(); u[Number(inp.dataset.vnavn)].navn = inp.value;
    main.querySelector("#lagreVarer").disabled = false;
  }));
  main.querySelectorAll("[data-vpris]").forEach((inp) => inp.addEventListener("input", () => {
    const u = utkast(); u[Number(inp.dataset.vpris)].prisTekst = inp.value;
    main.querySelector("#lagreVarer").disabled = false;
  }));
  main.querySelectorAll("[data-vfjern]").forEach((b) => b.addEventListener("click", () => {
    utkast().splice(Number(b.dataset.vfjern), 1);
    tegnPaaNytt();
  }));
  main.querySelector("#nyVare").addEventListener("click", () => {
    const u = utkast();
    u.push({ id: `fortype-${Date.now().toString(36)}`, navn: "", pris: null });
    tegnPaaNytt();
    main.querySelector(`[data-vnavn="${u.length - 1}"]`)?.focus();
  });
  main.querySelector("#avbrytVarer")?.addEventListener("click", () => { varerUtkast = null; tegnPaaNytt(); });
  main.querySelector("#lagreVarer").addEventListener("click", async (e) => {
    const u = utkast();
    const ferdig = [];
    for (const v of u) {
      const navn = v.navn.trim();
      if (!navn) continue;
      const prisTekst = v.prisTekst ?? belopTilInput(v.pris);
      const pris = prisTekst.trim() ? tolkBelop(prisTekst) : null;
      if (prisTekst.trim() && (pris == null || pris <= 0)) return melding(`Prisen for ${navn} ser ikke riktig ut.`, "feil");
      ferdig.push({ id: v.id, navn, pris });
    }
    await medKnapp(e.currentTarget, async () => {
      await lagreForInnstillinger({ varer: ferdig });
      varerUtkast = null;
      melding("Fôrtypene er lagret.");
      tegnPaaNytt();
    });
  });

  // Beskjed og varsel
  huskSkjema(main, "forInnst", "innst");
  const innst = main.querySelector("#forInnst");
  innst.addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = new FormData(innst);
    await medKnapp(e.submitter, async () => {
      await lagreForInnstillinger({
        info: String(v.get("info") || "").trim().slice(0, 1000), varsel: v.get("varsel") === "on", neste: String(v.get("neste") || ""),
      });
      glemSkjema("forInnst");
      melding("Lagret.");
    });
  });
}
forAlle.live = true;
forAlle.tittel = "Alle fôrbestillinger";
forAlle.trenger = ["forInnst", "forbestillinger", "forabonnenter"];
