// Nedtrekksmenyer i sidens eget design.
// Selve <select>-feltet blir stående (det er allerede stylet), men lista som åpner seg tegnes av oss
// i stedet for nettleserens grå systemmeny. Verdien settes fortsatt på det ekte feltet, så skjemaer og
// koden som leser .value virker som før. På mobil og nettbrett beholdes telefonens egen velger, den er best der.

const pc = matchMedia("(hover: hover) and (pointer: fine)");
const hake = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>`;

let aapen = null; // { select, liste, valg: [{ el, option }], aktiv }

export function startNedtrekk() {
  document.addEventListener("mousedown", (e) => {
    if (aapen && !aapen.liste.contains(e.target) && e.target !== aapen.select) lukk();
    const sel = e.target.closest?.("select");
    if (!sel || !brukes(sel) || e.button !== 0) return;
    e.preventDefault(); // stopper nettleserens egen meny
    sel.focus();
    if (aapen?.select === sel) lukk();
    else aapne(sel);
  }, true);

  document.addEventListener("keydown", (e) => {
    if (aapen) return tastIListe(e);
    const sel = e.target;
    if (!(sel instanceof HTMLSelectElement) || !brukes(sel)) return;
    const apneTast = e.key === " " || e.key === "Enter" || (e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp"))
      || ((e.key === "ArrowDown" || e.key === "ArrowUp") && /Mac/.test(navigator.platform));
    if (apneTast) { e.preventDefault(); aapne(sel); }
  }, true);

  addEventListener("resize", () => lukk());
  document.addEventListener("scroll", (e) => { if (aapen && !aapen.liste.contains(e.target)) lukk(); }, true);
  document.addEventListener("focusout", (e) => { if (aapen && e.target === aapen.select) setTimeout(() => { if (aapen && document.activeElement !== aapen.select) lukk(); }); }, true);
  addEventListener("hashchange", () => lukk());
}

function brukes(sel) {
  return pc.matches && !sel.disabled && !sel.multiple && sel.size <= 1;
}

function aapne(sel) {
  lukk();
  const liste = document.createElement("div");
  liste.className = "nedtrekk-liste";
  liste.setAttribute("role", "listbox");
  const valg = [];
  for (const barn of sel.children) {
    if (barn instanceof HTMLOptGroupElement) {
      const overskrift = document.createElement("div");
      overskrift.className = "nedtrekk-gruppe";
      overskrift.textContent = barn.label;
      liste.append(overskrift);
      for (const o of barn.children) leggTil(o, barn.disabled);
    } else if (barn instanceof HTMLOptionElement) leggTil(barn, false);
  }
  function leggTil(option, gruppeAv) {
    if (option.hidden) return;
    const el = document.createElement("div");
    el.className = "nedtrekk-valg";
    el.setAttribute("role", "option");
    const av = option.disabled || gruppeAv;
    if (av) el.setAttribute("aria-disabled", "true");
    if (option.selected) el.setAttribute("aria-selected", "true");
    el.innerHTML = hake;
    const tekst = document.createElement("span");
    tekst.textContent = option.label || option.text || " ";
    el.append(tekst);
    const nr = valg.length;
    if (!av) {
      el.addEventListener("mousemove", () => marker(nr, false));
      el.addEventListener("click", () => velg(option));
    }
    valg.push({ el, option, av });
    liste.append(el);
  }
  liste.addEventListener("mousedown", (e) => e.preventDefault()); // fokus blir på feltet
  document.body.append(liste);
  aapen = { select: sel, liste, valg, aktiv: -1, sok: "", sokTid: 0 };
  sel.setAttribute("aria-expanded", "true");
  plasser();
  marker(Math.max(0, valg.findIndex((v) => v.option.selected && !v.av)), true);
}

function plasser() {
  const { select, liste } = aapen;
  const r = select.getBoundingClientRect();
  const luft = 8;
  liste.style.minWidth = `${r.width}px`;
  liste.style.maxWidth = `${Math.max(r.width, Math.min(520, innerWidth - 2 * luft))}px`;
  const under = innerHeight - r.bottom - luft;
  const over = r.top - luft;
  const onsket = Math.min(liste.scrollHeight, 340);
  const nedover = under >= onsket || under >= over;
  liste.style.maxHeight = `${Math.max(120, Math.min(340, (nedover ? under : over) - 6))}px`;
  const bredde = liste.offsetWidth;
  liste.style.left = `${Math.max(luft, Math.min(r.left, innerWidth - bredde - luft))}px`;
  if (nedover) { liste.style.top = `${r.bottom + 6}px`; liste.style.bottom = ""; }
  else { liste.style.bottom = `${innerHeight - r.top + 6}px`; liste.style.top = ""; liste.classList.add("oppover"); }
}

function marker(nr, rull) {
  if (!aapen || nr < 0 || nr >= aapen.valg.length) return;
  aapen.valg[aapen.aktiv]?.el.classList.remove("aktiv");
  aapen.aktiv = nr;
  const el = aapen.valg[nr].el;
  el.classList.add("aktiv");
  if (rull) el.scrollIntoView({ block: "nearest" });
}

function flytt(retning) {
  const { valg, aktiv } = aapen;
  for (let i = aktiv + retning; i >= 0 && i < valg.length; i += retning) {
    if (!valg[i].av) return marker(i, true);
  }
}

function velg(option) {
  const sel = aapen.select;
  lukk();
  if (option.selected) return;
  option.selected = true;
  sel.dispatchEvent(new Event("input", { bubbles: true }));
  sel.dispatchEvent(new Event("change", { bubbles: true }));
}

function tastIListe(e) {
  const { valg } = aapen;
  const stopp = () => { e.preventDefault(); e.stopPropagation(); };
  switch (e.key) {
    case "ArrowDown": stopp(); return flytt(1);
    case "ArrowUp": stopp(); return flytt(-1);
    case "Home": stopp(); aapen.aktiv = -1; return flytt(1);
    case "End": stopp(); aapen.aktiv = valg.length; return flytt(-1);
    case "PageDown": stopp(); for (let i = 0; i < 8; i++) flytt(1); return;
    case "PageUp": stopp(); for (let i = 0; i < 8; i++) flytt(-1); return;
    case "Enter": case " ":
      if (e.key === " " && aapen.sok) break;
      stopp();
      return valg[aapen.aktiv] ? velg(valg[aapen.aktiv].option) : lukk();
    case "Escape": stopp(); return lukk();
    case "Tab": return lukk();
  }
  // Skriv de første bokstavene for å hoppe til et valg.
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    stopp();
    const naa = Date.now();
    aapen.sok = (naa - aapen.sokTid > 700 ? "" : aapen.sok) + e.key.toLowerCase();
    aapen.sokTid = naa;
    const start = aapen.sok.length === 1 ? aapen.aktiv + 1 : aapen.aktiv;
    for (let k = 0; k < valg.length; k++) {
      const i = (start + k) % valg.length;
      if (!valg[i].av && valg[i].option.text.trim().toLowerCase().startsWith(aapen.sok)) return marker(i, true);
    }
  }
}

function lukk() {
  if (!aapen) return;
  aapen.liste.remove();
  aapen.select.removeAttribute("aria-expanded");
  aapen = null;
}
