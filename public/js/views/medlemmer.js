// Medlemsliste med kontingent, tilgang og forespørsler fra nye brukere.

import { html, raw, kr, iDag, tolkBelop, belopTilInput, datoTekst, lastNedCsv } from "../util.js";
import { kontovalg } from "./poster.js";
import {
  lagreMedlem, slettMedlem, registrerKontingent, angreKontingent, godkjennForesporsel, slettForesporsel,
  lagreBruker, slettBruker, normalEpost, registrerPaminnelse,
} from "../firebase.js";
import { melding, medKnapp, bekreft, dialog } from "../ui.js";
import { gaaTil } from "../app.js";
import { ikon } from "../ikoner.js";
import { vervFor } from "./styret.js";

const filter = { sok: "", vis: "aktive" };

export function liste(main, S) {
  const aar = S.aar;
  const sok = filter.sok.toLowerCase();
  const tilgang = new Map(S.brukere.map((b) => [b.id, b]));
  const sortert = [...S.medlemmer].sort((a, b) => (a.navn || "").localeCompare(b.navn || "", "nb"));
  const synlige = sortert.filter((m) =>
    (filter.vis === "alle" || (filter.vis === "aktive" && m.aktiv !== false)
      || (filter.vis === "ubetalt" && m.aktiv !== false && !m.kontingent?.[aar]?.betalt))
    && (!sok || `${m.navn} ${m.epost} ${m.telefon}`.toLowerCase().includes(sok)));
  const ubetalte = ikkeBetalt(S, aar);

  main.innerHTML = html`
    <div class="sidetopp">
      <h1>Medlemmer</h1>
      <div class="knapperad">
        <button class="knapp sekundaer" id="eksport">${raw(ikon("lastned"))} Excel</button>
        <a class="knapp" href="#/medlem/ny">+ Nytt medlem</a>
      </div>
    </div>

    ${S.foresporsler.length ? raw(html`
      <section class="kort uthevet">
        <h2>Ber om tilgang</h2>
        <ul class="enkel-liste">${S.foresporsler.map((f) => raw(html`
          <li>
            <span><strong>${f.navn}</strong><br><span class="hint">${f.epost}</span></span>
            <span class="knapperad">
              <button class="knapp sekundaer liten" data-avvis="${f.id}">Avvis</button>
              <button class="knapp liten" data-godkjenn="${f.id}">Gi tilgang</button>
            </span>
          </li>`))}</ul>
      </section>`) : ""}

    <div class="filterlinje">
      <input type="search" id="sok" placeholder="Søk etter navn, e-post, telefon …" value="${filter.sok}">
      <select id="vis">
        <option value="aktive" ${filter.vis === "aktive" ? "selected" : ""}>Aktive medlemmer</option>
        <option value="ubetalt" ${filter.vis === "ubetalt" ? "selected" : ""}>Ikke betalt ${aar}</option>
        <option value="alle" ${filter.vis === "alle" ? "selected" : ""}>Alle (også utmeldte)</option>
      </select>
    </div>

    ${ubetalte.length && filter.vis === "ubetalt" ? raw(html`
      <section class="kort uthevet paminnelse">
        <p><strong>${ubetalte.length}</strong> aktive medlemmer har ikke betalt kontingent for ${aar}.
          ${sistPaminnet(ubetalte, aar) ? `Sist påminnet ${datoTekst(sistPaminnet(ubetalte, aar))}.` : ""}</p>
        <div class="knapperad">
          <button class="knapp liten" id="paminnelse">${raw(ikon("send"))} Send påminnelse</button>
        </div>
      </section>`) : ubetalte.length && filter.vis === "aktive" && !sok ? raw(html`
      <p class="hint">${ubetalte.length} har ikke betalt for ${aar}. <a href="#/medlemmer" id="visUbetalte">Vis dem og send påminnelse</a></p>`) : ""}

    ${synlige.length ? raw(html`<ul class="medlemsliste">${synlige.map((m) => {
      const betalt = m.kontingent?.[aar]?.betalt;
      const t = m.epost ? tilgang.get(normalEpost(m.epost)) : null;
      return raw(html`
        <li class="${m.aktiv === false ? "utmeldt" : ""}">
          <a href="#/medlem/${m.id}" class="medlem-info">
            <strong>${m.navn}</strong>
            <span class="hint">${[filter.vis === "ubetalt" && !m.epost && "mangler e-post", m.epost, t && (roller(S, t).join(", ") || "har innlogging"), m.aktiv === false && "utmeldt",
              filter.vis === "ubetalt" && m.paminnet?.[aar] && `påminnet ${datoTekst(m.paminnet[aar])}`].filter(Boolean).join(" · ")}</span>
          </a>
          <button class="kontingent ${betalt ? "betalt" : ""}" data-kontingent="${m.id}" title="Kontingent ${aar}">
            ${betalt ? `✓ Betalt ${aar}` : `Ikke betalt ${aar}`}
          </button>
        </li>`);
    })}</ul>`) : raw(`<div class="tom">${S.medlemmer.length ? "Ingen medlemmer passer filteret." : "Ingen medlemmer ennå. Legg dem til med «+ Nytt medlem», eller be dem opprette konto selv, så dukker de opp her."}</div>`)}`;

  const sokefelt = main.querySelector("#sok");
  sokefelt.addEventListener("input", () => {
    filter.sok = sokefelt.value;
    const pos = sokefelt.selectionStart;
    liste(main, S);
    const nytt = main.querySelector("#sok");
    nytt.focus();
    nytt.setSelectionRange(pos, pos);
  });
  main.querySelector("#vis").addEventListener("change", (e) => { filter.vis = e.target.value; liste(main, S); });
  main.querySelector("#eksport").addEventListener("click", () => eksporter(S, sortert));
  main.querySelector("#paminnelse")?.addEventListener("click", () => paminnelse(S, ubetalte, aar));
  main.querySelector("#visUbetalte")?.addEventListener("click", (e) => { e.preventDefault(); filter.vis = "ubetalt"; liste(main, S); });

  main.querySelectorAll("[data-kontingent]").forEach((b) => b.addEventListener("click", () => {
    const m = S.medlemmer.find((x) => x.id === b.dataset.kontingent);
    if (m.kontingent?.[aar]?.betalt) angre(m, aar);
    else registrer(S, m, aar);
  }));

  main.querySelectorAll("[data-godkjenn]").forEach((b) => b.addEventListener("click", () => medKnapp(b, async () => {
    const f = S.foresporsler.find((x) => x.id === b.dataset.godkjenn);
    const finnes = S.medlemmer.find((m) => normalEpost(m.epost) === f.epost);
    await godkjennForesporsel(f, finnes?.id);
    melding(`${f.navn} har fått tilgang${finnes ? " og er koblet til medlemmet med samme e-post" : " og er lagt til i medlemslisten"}.`);
  })));
  main.querySelectorAll("[data-avvis]").forEach((b) => b.addEventListener("click", async () => {
    if (!(await bekreft("Avvise forespørselen? Personen kan spørre på nytt senere.", { ja: "Avvis" }))) return;
    await medKnapp(b, () => slettForesporsel(b.dataset.avvis));
  }));
}
liste.live = true;
liste.tittel = "Medlemmer";

// Styreverv først; tilgangsrollen vises bare når den ikke allerede står som verv (kasserer er både verv og tilgang).
function roller(S, t) {
  const verv = vervFor(S, t.id).map((v) => v.toLowerCase());
  const tilgang = t.admin ? "administrator" : t.rolle === "kasserer" ? "kasserer" : "";
  return tilgang && !verv.includes(tilgang) ? [...verv, tilgang] : verv;
}
liste.trenger = ["medlemmer", "brukere", "foresporsler", "poster", "innst", "info", "verv"];

// ---------- Påminnelse om kontingent ----------

const ikkeBetalt = (S, aar) => S.medlemmer
  .filter((m) => m.aktiv !== false && !m.kontingent?.[aar]?.betalt)
  .sort((a, b) => (a.navn || "").localeCompare(b.navn || "", "nb"));

function sistPaminnet(medlemmer, aar) {
  return medlemmer.map((m) => m.paminnet?.[aar]).filter(Boolean).sort().pop() || "";
}

function omDager(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function paminnelseTekst(S, aar, frist) {
  const info = S.info;
  const klubb = info.klubbnavn || S.innst.klubbnavn;
  return [
    "Hei!",
    "",
    `Vi kan ikke se at vi har fått kontingenten for ${aar} fra deg ennå.`,
    "",
    info.kontingentBelop ? `Beløp: ${kr(info.kontingentBelop)}` : null,
    info.kontonummer ? `Kontonummer: ${info.kontonummer}` : null,
    frist ? `Frist: ${datoTekst(frist)}` : null,
    "Merk betalingen med navnet ditt.",
    info.betalingsinfo ? `\n${info.betalingsinfo}` : null,
    "",
    "Har du betalt nylig, kan du se bort fra denne e-posten.",
    "",
    "Hilsen",
    `Kassereren i ${klubb}`,
  ].filter((x) => x !== null).join("\n");
}

function paminnelse(S, ubetalte, aar) {
  const medEpost = ubetalte.filter((m) => m.epost);
  const utenEpost = ubetalte.filter((m) => !m.epost);
  const adr = medEpost.map((m) => m.epost);
  const klubb = S.info.klubbnavn || S.innst.klubbnavn;
  let fristStandard = omDager(14);
  const d = dialog(html`
    <h2>Påminnelse om kontingent ${aar}</h2>
    <form class="skjema" id="p">
      <p class="hint">Går som blindkopi (Bcc) til ${medEpost.length} ${medEpost.length === 1 ? "medlem" : "medlemmer"} som ikke har betalt.</p>
      ${utenEpost.length ? raw(html`<div class="varsel info">Mangler e-post: ${utenEpost.map((m) => m.navn).join(", ")}. Ring eller send SMS til ${utenEpost.length === 1 ? "denne" : "disse"}.</div>`) : ""}
      ${!S.info.kontonummer || !S.info.kontingentBelop ? raw(`<div class="varsel info">Beløp eller kontonummer mangler. Fyll det inn under <a href="#/innstillinger">Innstillinger</a>, eller skriv det i teksten under.</div>`) : ""}
      <label>Frist<input type="date" name="frist" value="${fristStandard}"></label>
      <label>Emne<input name="emne" value="Påminnelse om kontingent ${aar}, ${klubb}"></label>
      <label>Tekst<textarea name="tekst" rows="12">${paminnelseTekst(S, aar, fristStandard)}</textarea></label>
      <label class="avkryss"><input type="checkbox" name="merk" checked> Noter at de er påminnet i dag</label>
      <div class="knapper">
        <button type="button" class="knapp sekundaer" data-lukk>Avbryt</button>
        <button type="button" class="knapp sekundaer" id="kopierAdr" ${adr.length ? "" : "disabled"}>Kopier adressene</button>
        <button type="submit" class="knapp" ${adr.length ? "" : "disabled"}>${raw(ikon("send"))} Åpne e-post</button>
      </div>
    </form>`, { bred: true });
  const f = d.querySelector("#p");
  // Ny frist oppdaterer teksten, så lenge kassereren ikke har skrevet om den selv.
  f.elements.frist.addEventListener("change", () => {
    if (f.elements.tekst.value === paminnelseTekst(S, aar, fristStandard)) f.elements.tekst.value = paminnelseTekst(S, aar, f.elements.frist.value);
    fristStandard = f.elements.frist.value;
  });
  const merk = async () => {
    if (f.elements.merk.checked) await registrerPaminnelse(medEpost.map((m) => m.id), String(aar), iDag());
  };
  d.querySelector("#kopierAdr").addEventListener("click", (e) => medKnapp(e.currentTarget, async () => {
    try {
      await navigator.clipboard.writeText(adr.join(", "));
    } catch {
      return melding("Klarte ikke å kopiere. Prøv igjen.", "feil");
    }
    await merk();
    melding("Adressene er kopiert. Lim dem inn i Bcc-feltet i e-posten.");
  }));
  f.addEventListener("submit", (e) => {
    e.preventDefault();
    const emne = encodeURIComponent(f.elements.emne.value);
    const tekst = encodeURIComponent(f.elements.tekst.value.replace(/\n/g, "\r\n"));
    let url = `mailto:?bcc=${adr.map(encodeURIComponent).join(",")}&subject=${emne}&body=${tekst}`;
    medKnapp(e.submitter, async () => {
      // Svært lange lenker (mange mottakere) kan e-postprogrammer avvise. Da kopieres adressene i stedet.
      if (url.length > 8000) {
        url = `mailto:?subject=${emne}&body=${tekst}`;
        await navigator.clipboard.writeText(adr.join(", ")).catch(() => {});
        melding("Det er for mange mottakere til å legge dem inn direkte. Adressene er kopiert, så lim dem inn i Bcc-feltet.");
      }
      await merk();
      d.close();
      location.href = url;
    });
  });
}

function registrer(S, m, aar) {
  const standard = S.info.kontingentBelop || 0;
  const d = dialog(html`
    <h2>Kontingent ${aar}: ${m.navn}</h2>
    <form class="skjema" id="k">
      <div class="to-kol">
        <label>Betalt dato<input type="date" name="dato" value="${iDag()}" required></label>
        <label>Beløp (kr)<input name="belop" inputmode="decimal" value="${belopTilInput(standard || null)}" required></label>
      </div>
      <label class="avkryss"><input type="checkbox" name="foer" checked> Før som inntekt i regnskapet</label>
      ${S.innst.kontoer.length > 1 ? raw(`<div data-foer>${kontovalg(S.innst, "konto", S.innst.kontoer[0].id, "Innbetalt til konto")}</div>`) : ""}
      <p class="hint">Har dere fått ett samlet beløp for mange medlemmer (f.eks. fra Vipps), kan du fjerne haken og føre totalen som én post i stedet.</p>
      <div class="knapper">
        <button type="button" class="knapp sekundaer" data-lukk>Avbryt</button>
        <button type="submit" class="knapp">Registrer betaling</button>
      </div>
    </form>`);
  const f = d.querySelector("#k");
  f.elements.foer.addEventListener("change", () => { const k = f.querySelector("[data-foer]"); if (k) k.hidden = !f.elements.foer.checked; });
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f));
    const belop = tolkBelop(v.belop);
    if (belop == null || belop < 0) return melding("Skriv et gyldig beløp.", "feil");
    await medKnapp(e.submitter, async () => {
      await registrerKontingent(m, String(aar), {
        dato: v.dato, belop,
        post: v.foer ? {
          type: "inntekt", dato: v.dato, belop, kategori: S.innst.kategorier.inntekt.includes("Kontingent") ? "Kontingent" : S.innst.kategorier.inntekt[0],
          beskrivelse: `Kontingent ${aar}: ${m.navn}`, konto: v.konto || S.innst.kontoer[0].id, kvitteringIds: [],
        } : null,
      });
      d.close();
      melding(`Kontingent registrert for ${m.navn}.`);
    });
  });
}

async function angre(m, aar) {
  const info = m.kontingent[aar];
  const tekst = `Angre kontingent ${aar} for ${m.navn} (betalt ${datoTekst(info.dato)}, ${kr(info.belop)})?`
    + (info.postId ? " Inntektsposten i regnskapet slettes også." : "");
  if (!(await bekreft(tekst, { ja: "Angre betaling", farlig: true }))) return;
  await medKnapp(null, () => angreKontingent(m, String(aar)));
}

function eksporter(S, medlemmer) {
  const aar = S.aar;
  const rader = [["Navn", "E-post", "Telefon", "Aktiv", `Kontingent ${aar}`, "Betalt dato", "Beløp", "Merknad"]];
  for (const m of medlemmer) {
    const k = m.kontingent?.[aar];
    rader.push([m.navn, m.epost, m.telefon, m.aktiv === false ? "Nei" : "Ja",
      k?.betalt ? "Betalt" : "Ikke betalt", k ? datoTekst(k.dato) : "", k ? (k.belop / 100).toFixed(2).replace(".", ",") : "", m.merknad]);
  }
  lastNedCsv(`${S.innst.kortnavn || "TPTHK"}-medlemmer-${aar}.csv`, rader);
}

export function skjema(main, S, id) {
  const ny = id === "ny";
  const m = ny ? {} : S.medlemmer.find((x) => x.id === id);
  if (!m) {
    main.innerHTML = `<div class="tom">Fant ikke medlemmet. <a href="#/medlemmer">Tilbake</a></div>`;
    return;
  }
  const gammelEpost = normalEpost(m.epost);
  const tilgang = gammelEpost ? S.brukere.find((b) => b.id === gammelEpost) : null;
  const erMeg = gammelEpost && gammelEpost === normalEpost(S.bruker.email);
  const betalinger = Object.entries(m.kontingent || {}).filter(([, v]) => v?.betalt).sort(([a], [b]) => b - a);

  main.innerHTML = html`
    <div class="sidetopp"><h1>${ny ? "Nytt medlem" : m.navn}</h1><a class="lenkeknapp" href="#/medlemmer">Tilbake</a></div>
    <form id="skjema" class="skjema kort">
      <label>Navn<input name="navn" value="${m.navn || ""}" required autocomplete="off"></label>
      <div class="to-kol">
        <label>E-post<input name="epost" type="email" value="${m.epost || ""}" autocomplete="off"></label>
        <label>Telefon<input name="telefon" type="tel" value="${m.telefon || ""}" autocomplete="off"></label>
      </div>
      <label>Merknad<textarea name="merknad" rows="2">${m.merknad || ""}</textarea></label>
      <label class="avkryss"><input type="checkbox" name="aktiv" ${m.aktiv !== false ? "checked" : ""}> Aktivt medlem</label>
      <label class="avkryss"><input type="checkbox" name="tilgang" ${tilgang ? "checked" : ""} ${erMeg ? "disabled" : ""}>
        Kan logge inn og sende søknader om refusjon</label>
      ${tilgang ? raw(html`<p class="hint">Styreverv: ${vervFor(S, tilgang.id).join(", ") || "ingen"}. <a href="#/styret">Endre under Styret</a></p>`) : ""}
      <p class="hint">Personen oppretter selv konto på nettsiden med samme e-post. ${tilgang?.rolle === "kasserer" ? "Denne personen er kasserer (endres under Innstillinger)." : ""}</p>
      <div class="knapper">
        ${ny ? "" : raw(`<button type="button" class="knapp farlig sekundaer" id="slett">Slett</button>`)}
        <button type="submit" class="knapp">${ny ? "Legg til" : "Lagre"}</button>
      </div>
    </form>

    ${betalinger.length ? raw(html`
      <section class="kort">
        <h2>Betalt kontingent</h2>
        <ul class="enkel-liste">${betalinger.map(([aar, v]) => raw(html`<li><span>${aar}</span><span>${datoTekst(v.dato)} · ${kr(v.belop)}</span></li>`))}</ul>
      </section>`) : ""}`;

  const f = main.querySelector("#skjema");
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f));
    const epost = normalEpost(v.epost);
    const vilHaTilgang = erMeg || Boolean(v.tilgang);
    if (vilHaTilgang && !epost) return melding("Skriv inn e-post for å gi tilgang.", "feil");
    if (epost && S.medlemmer.some((x) => x.id !== m.id && normalEpost(x.epost) === epost)) {
      return melding("Et annet medlem har allerede denne e-postadressen.", "feil");
    }
    await medKnapp(e.submitter, async () => {
      const medlemId = await lagreMedlem(ny ? null : m.id, {
        navn: v.navn.trim(), epost, telefon: v.telefon.trim(), merknad: v.merknad.trim(), aktiv: Boolean(v.aktiv),
      });
      // Flytt eller fjern tilgang når e-posten endres eller haken fjernes.
      if (tilgang && tilgang.rolle !== "kasserer" && (gammelEpost !== epost || !vilHaTilgang)) await slettBruker(gammelEpost);
      if (vilHaTilgang) {
        const rolle = (gammelEpost === epost && tilgang?.rolle) || S.brukere.find((b) => b.id === epost)?.rolle || "medlem";
        await lagreBruker(epost, { rolle, navn: v.navn.trim(), medlemId });
      }
      melding(ny ? "Medlemmet er lagt til." : "Endringene er lagret.");
      gaaTil("medlemmer");
    });
  });

  main.querySelector("#slett")?.addEventListener("click", async (e) => {
    if (erMeg) return melding("Du kan ikke slette deg selv.", "feil");
    if (!(await bekreft(`Slette ${m.navn}? Tips: Er personen bare utmeldt, fjern heller haken for «Aktivt medlem» så historikken beholdes.`, { ja: "Slett", farlig: true }))) return;
    await medKnapp(e.currentTarget, async () => {
      await slettMedlem(m, tilgang && tilgang.rolle !== "kasserer");
      melding("Medlemmet er slettet.");
      gaaTil("medlemmer");
    });
  });
}
skjema.tittel = "Medlem";
skjema.trenger = ["medlemmer", "brukere", "verv"];
