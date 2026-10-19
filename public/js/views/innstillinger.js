// Innstillinger: klubbinfo, kontingent, startsaldo, kategorier, hvem som er kasserer og revisor, support, sikkerhetskopi og nullstilling.

import { html, raw, tolkBelop, belopTilInput, datoTekst, iDag } from "../util.js";
import { lagreInnstillinger, lagreMedlemsinfo, lagreBruker, slettBruker, normalEpost, tidspunktFra } from "../firebase.js";
import { melding, medKnapp, bekreft } from "../ui.js";
import { ikon } from "../ikoner.js";
import { supportKort, kobleSupport } from "./support.js";
import { kopiKort, kobleKopi } from "./sikkerhetskopi.js";
import { nullstillKort, kobleNullstill } from "./nullstill.js";
import { revisorUtloper, ekteKasserer } from "../tilgang.js";

// Under support kan administratoren ikke gi kasserer- eller revisortilgang (se firestore.rules), bare ta den bort.
const kanGiTilgang = (S) => ekteKasserer(S);
const BARE_KASSERER = "Under support kan ikke administratoren gi kasserer- eller revisortilgang. Det gjør kassereren selv.";

export function innstillinger(main, S) {
  const i = S.innst;
  const info = S.info;
  const meg = normalEpost(S.bruker.email);
  const kasserere = S.brukere.filter((b) => b.rolle === "kasserer" || b.admin);
  const andre = S.brukere.filter((b) => b.rolle !== "kasserer" && b.rolle !== "revisor" && !b.admin).sort((a, b) => (a.navn || a.id).localeCompare(b.navn || b.id, "nb"));

  const kategoriliste = (type) => html`
    <div class="kategorier" data-type="${type}">
      ${i.kategorier[type].map((k, n) => raw(html`
        <span class="brikke">${k}<button type="button" class="ikonknapp" data-fjern="${n}" aria-label="Fjern ${k}">${raw(ikon("lukk"))}</button></span>`))}
      <form class="ny-kategori"><input placeholder="Ny kategori" maxlength="40" required><button class="knapp sekundaer liten">Legg til</button></form>
    </div>`;

  main.innerHTML = html`
    <div class="sidetopp"><h1>Innstillinger</h1></div>

    ${raw(supportKort(S))}

    <form id="klubb" class="skjema kort">
      <h2>Klubben</h2>
      <label>Navn<input name="klubbnavn" value="${i.klubbnavn}" required></label>
      <div class="to-kol">
        <label>Kortnavn<input name="kortnavn" value="${i.kortnavn}" maxlength="12"></label>
        <label>Organisasjonsnummer<input name="orgnr" value="${i.orgnr}" inputmode="numeric"></label>
      </div>
      <h2>Kontingent</h2>
      <div class="to-kol">
        <label>Kontingent per år (kr)<input name="kontingentBelop" inputmode="decimal" value="${belopTilInput(info.kontingentBelop || null)}"></label>
        <label>Kontonummer for kontingent<input name="kontonummer" value="${info.kontonummer || ""}" inputmode="numeric"></label>
      </div>
      <label>Betalingsinformasjon til medlemmene (vises på «Min side»)
        <textarea name="betalingsinfo" rows="2" placeholder="F.eks. Betal til konto over eller Vipps #12345. Merk betalingen med navnet ditt.">${info.betalingsinfo || ""}</textarea>
      </label>
      <div class="knapper"><button class="knapp" type="submit">Lagre</button></div>
    </form>

    <form id="kontoer" class="skjema kort">
      <h2>Kontoer</h2>
      <p class="hint">Bankkontoer, Vipps, kontantkasse osv. Startsaldo er det som sto på kontoen den dagen dere begynte å bruke nettsiden. Poster før denne datoen telles ikke med.</p>
      <label>Startdato<input type="date" name="startDato" value="${i.startDato}" required></label>
      <div id="kontorader"></div>
      <div class="knapper">
        <button type="button" class="knapp sekundaer" id="nyKonto">+ Legg til konto</button>
        <button type="submit" class="knapp">Lagre kontoer</button>
      </div>
    </form>

    <section class="kort">
      <h2>Kategorier for inntekter</h2>
      ${raw(kategoriliste("inntekt"))}
      <h2>Kategorier for utgifter</h2>
      ${raw(kategoriliste("utgift"))}
      <p class="hint">Fjerner du en kategori, beholder gamle poster den likevel.</p>
    </section>

    <section class="kort">
      <h2>Kasserere og administratorer</h2>
      <p class="hint">Kasserere ser hele regnskapet. Når det kommer ny kasserer, gjør vedkommende til kasserer her, og fjern deg selv etterpå.
        Administratoren drifter nettsiden og ser regnskapet bare når dere ber om support.</p>
      <ul class="enkel-liste">${kasserere.map((b) => raw(html`
        <li><span><strong>${b.navn || b.id}</strong>${b.admin ? (b.rolle === "kasserer" ? " (administrator med full tilgang)" : " (administrator, tilgang ved support)") : ""}<br><span class="hint">${b.id}</span></span>
        ${b.id === meg && b.admin && b.rolle === "kasserer" ? raw(`<button class="knapp sekundaer liten" id="tilSupport">Bytt til tilgang bare ved support</button>`)
          : b.id === meg ? raw(`<span class="hint">Deg</span>`) : raw(html`<button class="knapp sekundaer liten" data-rolle="${b.id}" data-til="medlem">${b.admin ? "Fjern som administrator" : "Fjern som kasserer"}</button>`)}</li>`))}
      </ul>
      ${!kanGiTilgang(S) ? raw(html`<p class="hint">${BARE_KASSERER}</p>`) : andre.length ? raw(html`
        <label>Gjør et medlem med innlogging til kasserer
          <span class="knapperad">
            <select id="nyKasserer">${andre.map((b) => raw(html`<option value="${b.id}">${b.navn || b.id} (${b.id})</option>`))}</select>
            <button class="knapp sekundaer" id="gjorKasserer">Gjør til kasserer</button>
          </span>
        </label>`) : raw(`<p class="hint">For å legge til en ny kasserer: legg personen inn som medlem med e-post og huk av for innlogging. Da dukker hen opp her.</p>`)}
    </section>

    ${raw(revisorKort(S))}

    ${raw(kopiKort(S))}

    ${raw(nullstillKort(S))}`;

  const klubb = main.querySelector("#klubb");
  klubb.addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(klubb));
    const kontingentBelop = v.kontingentBelop ? tolkBelop(v.kontingentBelop) : 0;
    if (kontingentBelop == null) return melding("Sjekk beløpene, de må være tall.", "feil");
    await medKnapp(e.submitter, async () => {
      await lagreInnstillinger({
        klubbnavn: v.klubbnavn.trim(), kortnavn: v.kortnavn.trim(), orgnr: v.orgnr.trim(),
      });
      await lagreMedlemsinfo({
        klubbnavn: v.klubbnavn.trim(), kontonummer: v.kontonummer.trim(), kontingentBelop, betalingsinfo: v.betalingsinfo.trim(),
      });
      melding("Innstillingene er lagret.");
    });
  });

  kobleKontoer(main, S);

  main.querySelectorAll(".kategorier").forEach((boks) => {
    const type = boks.dataset.type;
    const liste = [...i.kategorier[type]];
    const lagre = (ny) => medKnapp(null, () => lagreInnstillinger({ kategorier: { ...i.kategorier, [type]: ny } }));
    boks.querySelectorAll("[data-fjern]").forEach((b) => b.addEventListener("click", async () => {
      const n = Number(b.dataset.fjern);
      if (liste.length <= 1) return melding("Det må være minst én kategori.", "feil");
      if (!(await bekreft(`Fjerne kategorien «${liste[n]}»?`, { ja: "Fjern" }))) return;
      lagre(liste.filter((_, x) => x !== n));
    }));
    const skjema = boks.querySelector("form");
    skjema.addEventListener("submit", (e) => {
      e.preventDefault();
      const navn = skjema.querySelector("input").value.trim();
      if (!navn) return;
      if (liste.some((k) => k.toLowerCase() === navn.toLowerCase())) return melding("Den kategorien finnes allerede.", "feil");
      lagre([...liste, navn]);
    });
  });

  kobleSupport(main, S);
  kobleKopi(main, S);
  kobleNullstill(main, S);
  kobleRevisor(main, S);
  main.querySelector("#tilSupport")?.addEventListener("click", async (e) => {
    if (!(await bekreft("Bli vanlig medlem som administrator? Du mister tilgangen til regnskapet med en gang, og får den bare tilbake når kassereren eller styret ber om support.", { ja: "Bytt" }))) return;
    await medKnapp(e.currentTarget, () => lagreBruker(meg, { rolle: "medlem", admin: true }));
  });

  main.querySelectorAll("[data-rolle]").forEach((b) => b.addEventListener("click", async () => {
    if (!(await bekreft(`Fjerne ${b.dataset.rolle} som kasserer? Personen beholder innlogging som vanlig medlem.`, { ja: "Fjern" }))) return;
    await medKnapp(b, () => lagreBruker(b.dataset.rolle, { rolle: "medlem", admin: false }));
  }));
  main.querySelector("#gjorKasserer")?.addEventListener("click", async (e) => {
    const epost = main.querySelector("#nyKasserer").value;
    if (!(await bekreft(`Gjøre ${epost} til kasserer? Personen får se og endre hele regnskapet.`, { ja: "Gjør til kasserer" }))) return;
    await medKnapp(e.currentTarget, () => lagreBruker(epost, { rolle: "kasserer" }));
  });
}
innstillinger.live = true;
innstillinger.tittel = "Innstillinger";
innstillinger.trenger = ["innst", "info", "brukere"];

/** Redigerbar liste over kontoer. Endringer lagres først når man trykker «Lagre kontoer». */
function kobleKontoer(main, S) {
  const skjema = main.querySelector("#kontoer");
  const rader = skjema.querySelector("#kontorader");
  const brukt = (id) => S.poster.some((p) => p.konto === id || p.fraKonto === id || p.tilKonto === id
    || (!p.konto && p.type !== "overforing" && id === S.innst.kontoer[0].id));
  let kontoer = S.innst.kontoer.map((k) => ({ ...k }));

  const les = () => {
    rader.querySelectorAll("[data-id]").forEach((r) => {
      const k = kontoer.find((x) => x.id === r.dataset.id);
      k.navn = r.querySelector("[name=navn]").value;
      k.kontonummer = r.querySelector("[name=kontonummer]").value;
      k.saldoTekst = r.querySelector("[name=startSaldo]").value;
    });
  };
  const tegn = () => {
    rader.innerHTML = kontoer.map((k) => html`
      <div class="kontorad" data-id="${k.id}">
        <label>Navn<input name="navn" value="${k.navn}" placeholder="F.eks. Brukskonto" required></label>
        <label>Kontonummer<input name="kontonummer" value="${k.kontonummer || ""}" inputmode="numeric" placeholder="Valgfritt"></label>
        <label>Startsaldo (kr)<input name="startSaldo" inputmode="decimal" value="${k.saldoTekst ?? belopTilInput(k.startSaldo || 0)}"></label>
        <button type="button" class="ikonknapp" data-fjern-konto="${k.id}" aria-label="Fjern ${k.navn}" ${kontoer.length < 2 ? "hidden" : ""}>${raw(ikon("lukk"))}</button>
      </div>`).join("");
    rader.querySelectorAll("[data-fjern-konto]").forEach((b) => b.addEventListener("click", () => {
      const id = b.dataset.fjernKonto;
      if (brukt(id)) return melding("Kontoen har poster og kan ikke fjernes. Gi den heller et nytt navn.", "feil");
      les();
      kontoer = kontoer.filter((k) => k.id !== id);
      tegn();
    }));
  };
  tegn();

  skjema.querySelector("#nyKonto").addEventListener("click", () => {
    les();
    kontoer.push({ id: Math.random().toString(36).slice(2, 10), navn: "", kontonummer: "", startSaldo: 0 });
    tegn();
    rader.querySelector(".kontorad:last-child input")?.focus();
  });

  skjema.addEventListener("submit", async (e) => {
    e.preventDefault();
    les();
    const ferdige = [];
    for (const k of kontoer) {
      const startSaldo = k.saldoTekst ? tolkBelop(k.saldoTekst) : 0;
      if (startSaldo == null) return melding(`Sjekk startsaldoen for «${k.navn}».`, "feil");
      ferdige.push({ id: k.id, navn: k.navn.trim(), kontonummer: k.kontonummer.trim(), startSaldo });
    }
    await medKnapp(e.submitter, async () => {
      await lagreInnstillinger({ kontoer: ferdige, startDato: skjema.elements.startDato.value });
      melding("Kontoene er lagret.");
    });
  });
}

// ---------- Revisor ----------

/** Dato (ÅÅÅÅ-MM-DD) for et tidspunkt i millisekunder, i lokal tid. */
const isoDato = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function revisorKort(S) {
  const revisorer = S.brukere.filter((b) => b.revisor === true).sort((a, b) => (a.navn || a.id).localeCompare(b.navn || b.id, "nb"));
  const kandidater = S.brukere.filter((b) => b.revisor !== true && b.rolle !== "kasserer" && !b.admin)
    .sort((a, b) => (a.navn || a.id).localeCompare(b.navn || b.id, "nb"));
  const status = (b) => {
    const til = revisorUtloper(b);
    if (til == null) return "Tilgang uten sluttdato";
    return til > Date.now() ? `Tilgang til og med ${datoTekst(isoDato(til))}` : `Tilgangen gikk ut ${datoTekst(isoDato(til))}`;
  };
  return html`
    <section class="kort" id="revisor">
      <h2>Revisor</h2>
      <p class="hint">Revisor kan lese regnskapet: oversikten, alle poster med kvitteringer, kontoene, årsrapporten og Excel-eksport.
        Revisor kan ikke endre noe, og ser ikke søknadene eller medlemmenes kontonumre. Sett gjerne en sluttdato, så stenges tilgangen av seg selv.</p>
      ${revisorer.length ? raw(html`<ul class="enkel-liste">${revisorer.map((b) => raw(html`
        <li><span><strong>${b.navn || b.id}</strong>${b.rolle === "revisor" ? " (ikke medlem)" : ""}<br><span class="hint">${b.id} · ${status(b)}</span></span>
        <button class="knapp sekundaer liten" data-fjern-revisor="${b.id}">Fjern</button></li>`))}
      </ul>`) : ""}
      ${!kanGiTilgang(S) ? raw(html`<p class="hint">${BARE_KASSERER}</p>`) : raw(html`
      <form id="nyRevisor" class="skjema">
        <div class="veksler" role="radiogroup" aria-label="Hvem er revisor">
          <button type="button" data-hvem="ekstern" class="valgt" aria-checked="true">Utenfor klubben</button>
          <button type="button" data-hvem="medlem" aria-checked="false">Medlem med innlogging</button>
        </div>
        <div data-for="ekstern" class="to-kol">
          <label>Navn<input name="navn" autocomplete="off" maxlength="100"></label>
          <label>E-post<input name="nyEpost" type="email" autocomplete="off"></label>
        </div>
        <p data-for="ekstern" class="hint">Revisoren lager konto på nettsiden med denne e-postadressen og kommer rett inn i regnskapet. Hen ser ikke møter, styret eller medlemssidene.</p>
        <label data-for="medlem" hidden>Medlem
          ${kandidater.length ? raw(html`<select name="epost">${kandidater.map((b) => raw(html`<option value="${b.id}">${b.navn || b.id} (${b.id})</option>`))}</select>`)
            : raw(`<span class="hint">Ingen medlemmer med innlogging å velge.</span>`)}
        </label>
        <label>Tilgang til og med (valgfritt)<input type="date" name="til" min="${iDag()}"></label>
        <div class="knapper venstre"><button class="knapp sekundaer" type="submit">Gi revisortilgang</button></div>
      </form>`)}
    </section>`;
}

function kobleRevisor(main, S) {
  main.querySelectorAll("[data-fjern-revisor]").forEach((b) => b.addEventListener("click", async () => {
    const epost = b.dataset.fjernRevisor;
    const ekstern = S.brukere.find((x) => x.id === epost)?.rolle === "revisor";
    const tekst = ekstern ? `Fjerne revisortilgangen til ${epost}? Personen kommer ikke inn på nettsiden lenger.`
      : `Fjerne revisortilgangen til ${epost}? Personen beholder innlogging som vanlig medlem.`;
    if (!(await bekreft(tekst, { ja: "Fjern" }))) return;
    await medKnapp(b, () => (ekstern ? slettBruker(epost) : lagreBruker(epost, { revisor: false, revisorTil: null })));
  }));
  const skjema = main.querySelector("#nyRevisor");
  if (!skjema) return;
  let hvem = "ekstern";
  skjema.querySelectorAll("[data-hvem]").forEach((b) => b.addEventListener("click", () => {
    hvem = b.dataset.hvem;
    skjema.querySelectorAll("[data-hvem]").forEach((x) => { x.classList.toggle("valgt", x === b); x.setAttribute("aria-checked", x === b); });
    skjema.querySelectorAll("[data-for]").forEach((el) => { el.hidden = el.dataset.for !== hvem; });
  }));
  skjema.addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(skjema));
    const til = v.til;
    const ekstern = hvem === "ekstern";
    const epost = ekstern ? normalEpost(v.nyEpost) : v.epost;
    if (ekstern) {
      if (!v.navn?.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(epost)) return melding("Skriv navn og en gyldig e-postadresse.", "feil");
      if (S.brukere.some((b) => b.id === epost)) return melding("Den e-postadressen har allerede innlogging. Velg «Medlem med innlogging» i stedet.", "feil");
    } else if (!epost) return melding("Velg et medlem.", "feil");
    // Tilgangen varer ut den valgte dagen.
    const slutt = til ? new Date(`${til}T23:59:59`).getTime() : null;
    if (slutt != null && slutt < Date.now()) return melding("Sluttdatoen har allerede vært.", "feil");
    const tekst = slutt ? ` til og med ${datoTekst(til)}` : ". Husk å fjerne tilgangen når revisjonen er ferdig";
    if (!(await bekreft(`Gi ${epost} lesetilgang til regnskapet${tekst}?`, { ja: "Gi tilgang" }))) return;
    await medKnapp(e.submitter, async () => {
      const revisorTil = slutt ? tidspunktFra(slutt) : null;
      await lagreBruker(epost, ekstern ? { rolle: "revisor", navn: v.navn.trim(), revisor: true, revisorTil } : { revisor: true, revisorTil });
      melding("Revisoren har fått tilgang.");
    });
  });
}
