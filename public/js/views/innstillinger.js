// Innstillinger: klubbinfo, kontingent, startsaldo, kategorier og hvem som er kasserer.

import { html, raw, tolkBelop, belopTilInput } from "../util.js";
import { lagreInnstillinger, lagreMedlemsinfo, lagreBruker, normalEpost } from "../firebase.js";
import { melding, medKnapp, bekreft } from "../ui.js";

export function innstillinger(main, S) {
  const i = S.innst;
  const info = S.info;
  const meg = normalEpost(S.bruker.email);
  const kasserere = S.brukere.filter((b) => b.rolle === "kasserer");
  const andre = S.brukere.filter((b) => b.rolle !== "kasserer").sort((a, b) => (a.navn || a.id).localeCompare(b.navn || b.id, "nb"));

  const kategoriliste = (type) => html`
    <div class="kategorier" data-type="${type}">
      ${i.kategorier[type].map((k, n) => raw(html`
        <span class="brikke">${k}<button type="button" class="ikonknapp" data-fjern="${n}" aria-label="Fjern ${k}">✕</button></span>`))}
      <form class="ny-kategori"><input placeholder="Ny kategori" maxlength="40" required><button class="knapp sekundaer liten">Legg til</button></form>
    </div>`;

  main.innerHTML = html`
    <div class="sidetopp"><h1>Innstillinger</h1></div>

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
        <label>Klubbens kontonummer<input name="kontonummer" value="${info.kontonummer || ""}" inputmode="numeric"></label>
      </div>
      <label>Betalingsinformasjon til medlemmene (vises på «Min side»)
        <textarea name="betalingsinfo" rows="2" placeholder="F.eks. Betal til konto over eller Vipps #12345. Merk betalingen med navnet ditt.">${info.betalingsinfo || ""}</textarea>
      </label>
      <h2>Startsaldo</h2>
      <p class="hint">Saldoen på klubbens konto(er) den dagen dere begynte å bruke denne nettsiden. Poster før denne datoen telles ikke med i saldoen.</p>
      <div class="to-kol">
        <label>Dato<input type="date" name="startDato" value="${i.startDato}" required></label>
        <label>Saldo (kr)<input name="startSaldo" inputmode="decimal" value="${belopTilInput(i.startSaldo)}"></label>
      </div>
      <div class="knapper"><button class="knapp" type="submit">Lagre</button></div>
    </form>

    <section class="kort">
      <h2>Kategorier for inntekter</h2>
      ${raw(kategoriliste("inntekt"))}
      <h2>Kategorier for utgifter</h2>
      ${raw(kategoriliste("utgift"))}
      <p class="hint">Fjerner du en kategori, beholder gamle poster den likevel.</p>
    </section>

    <section class="kort">
      <h2>Kasserere</h2>
      <p class="hint">Kasserere ser hele regnskapet. Når det kommer ny kasserer, gjør vedkommende til kasserer her, og fjern deg selv etterpå.</p>
      <ul class="enkel-liste">${kasserere.map((b) => raw(html`
        <li><span><strong>${b.navn || b.id}</strong><br><span class="hint">${b.id}</span></span>
        ${b.id === meg ? raw(`<span class="hint">Deg</span>`) : raw(html`<button class="knapp sekundaer liten" data-rolle="${b.id}" data-til="medlem">Fjern som kasserer</button>`)}</li>`))}
      </ul>
      ${andre.length ? raw(html`
        <label>Gjør et medlem med innlogging til kasserer
          <span class="knapperad">
            <select id="nyKasserer">${andre.map((b) => raw(html`<option value="${b.id}">${b.navn || b.id} (${b.id})</option>`))}</select>
            <button class="knapp sekundaer" id="gjorKasserer">Gjør til kasserer</button>
          </span>
        </label>`) : raw(`<p class="hint">For å legge til en ny kasserer: legg personen inn som medlem med e-post og huk av for innlogging. Da dukker hen opp her.</p>`)}
    </section>`;

  const klubb = main.querySelector("#klubb");
  klubb.addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(klubb));
    const startSaldo = v.startSaldo ? tolkBelop(v.startSaldo) : 0;
    const kontingentBelop = v.kontingentBelop ? tolkBelop(v.kontingentBelop) : 0;
    if (startSaldo == null || kontingentBelop == null) return melding("Sjekk beløpene, de må være tall.", "feil");
    await medKnapp(e.submitter, async () => {
      await lagreInnstillinger({
        klubbnavn: v.klubbnavn.trim(), kortnavn: v.kortnavn.trim(), orgnr: v.orgnr.trim(), startDato: v.startDato, startSaldo,
      });
      await lagreMedlemsinfo({
        klubbnavn: v.klubbnavn.trim(), kontonummer: v.kontonummer.trim(), kontingentBelop, betalingsinfo: v.betalingsinfo.trim(),
      });
      melding("Innstillingene er lagret.");
    });
  });

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

  main.querySelectorAll("[data-rolle]").forEach((b) => b.addEventListener("click", async () => {
    if (!(await bekreft(`Fjerne ${b.dataset.rolle} som kasserer? Personen beholder innlogging som vanlig medlem.`, { ja: "Fjern" }))) return;
    await medKnapp(b, () => lagreBruker(b.dataset.rolle, { rolle: "medlem" }));
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
