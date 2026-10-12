// Egne strekikoner for TPTHK. Alle tegnet på et 24×24-rutenett med samme strekbredde,
// så de ser ut som et sett. Fargen arves fra teksten rundt (currentColor).

const STI = {
  // Oversikt: stjernen fra logoen i et skjold av søyler
  oversikt: `<path d="M4 20h16"/><path d="M6 20v-6"/><path d="M10.5 20v-9"/><path d="M15 20v-5"/><path d="M19 20v-3"/>
    <path d="m12 2.6 1.1 2.3 2.5.3-1.8 1.7.4 2.5L12 8.2l-2.2 1.2.4-2.5-1.8-1.7 2.5-.3z"/>`,
  // Poster: kvittering med takket kant
  poster: `<path d="M6 2.8h12v18.4l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z"/><path d="M9 7.5h6"/><path d="M9 11h6"/><path d="M9 14.5h3.5"/>`,
  // Søknader: brett med pil inn
  soknader: `<path d="M3.5 13.5 6 5h12l2.5 8.5"/><path d="M3.5 13.5V19h17v-5.5h-5l-1.2 2.3h-4.6l-1.2-2.3z"/><path d="M12 2.8v7"/><path d="m9.3 7.3 2.7 2.7 2.7-2.7"/>`,
  // Medlemmer: to personer
  medlemmer: `<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.4-3.4 2.9-5.6 6-5.6s5.6 2.2 6 5.6"/><path d="M15.5 4.9a3.2 3.2 0 0 1 0 6.2"/><path d="M17.5 14.6c2 .6 3.3 2.6 3.5 5.4"/>`,
  // Årsrapport: dokument med laurbærblad-linje
  rapport: `<path d="M14 2.8H6.5a1.5 1.5 0 0 0-1.5 1.5v15.4a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5V7.8z"/><path d="M14 2.8v5h5"/>
    <path d="M8.5 13h7"/><path d="M8.5 16.5h4.5"/>`,
  // Innstillinger: skyveknapper
  innstillinger: `<path d="M4 6.5h9"/><path d="M17 6.5h3"/><circle cx="15" cy="6.5" r="2"/><path d="M4 12h3"/><path d="M11 12h9"/><circle cx="9" cy="12" r="2"/>
    <path d="M4 17.5h11"/><path d="M19 17.5h1"/><circle cx="17" cy="17.5" r="2"/>`,
  // Ny søknad: pluss i sirkel
  ny: `<circle cx="12" cy="12" r="8.8"/><path d="M12 8v8"/><path d="M8 12h8"/>`,
  // Min side: person
  person: `<circle cx="12" cy="8" r="3.6"/><path d="M4.8 20.5c.6-4 3.4-6.4 7.2-6.4s6.6 2.4 7.2 6.4"/>`,
  // Møter: kalender med stjerne
  moter: `<rect x="3.5" y="5" width="17" height="15.5" rx="1.8"/><path d="M3.5 10h17"/><path d="M8 3v4"/><path d="M16 3v4"/>
    <path d="m12 12 .9 1.8 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3z"/>`,
  // Signer: penn over en linje
  signer: `<path d="M4 20.5h16"/><path d="M14.8 4.2a2 2 0 0 1 2.9 2.9L9 15.8l-3.8.9.9-3.8z"/><path d="m13.3 5.7 2.9 2.9"/>`,
  pil: `<path d="m9 5 7 7-7 7"/>`,
  binders: `<path d="m20 11.5-7.8 7.8a5 5 0 0 1-7.1-7.1l8.2-8.2a3.3 3.3 0 0 1 4.7 4.7l-8.2 8.2a1.7 1.7 0 0 1-2.4-2.4l7.5-7.5"/>`,
  kamera: `<path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.7l1.6-2.2h6.4L16.8 7h2.7A1.5 1.5 0 0 1 21 8.5v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18z"/><circle cx="12" cy="13" r="3.5"/>`,
  lastned: `<path d="M12 3.5v11"/><path d="m7.5 10 4.5 4.5 4.5-4.5"/><path d="M4.5 16.5v2.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-2.5"/>`,
  skriver: `<path d="M7 8V3.5h10V8"/><path d="M7 17H5a1.5 1.5 0 0 1-1.5-1.5v-6A1.5 1.5 0 0 1 5 8h14a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 19 17h-2"/><path d="M7 13.5h10v7H7z"/>`,
  pluss: `<path d="M12 5v14"/><path d="M5 12h14"/>`,
  utlogg: `<path d="M14.5 4.5H18a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-3.5"/><path d="M10 16.5 5.5 12 10 7.5"/><path d="M5.5 12H15"/>`,
  tilbake: `<path d="M19 12H5"/><path d="m11 18-6-6 6-6"/>`,
  hund: `<path d="M5.5 9.5 4 4l4 2.2"/><path d="M14 6.2 18 4l-1.5 5.5"/><path d="M8 6.2h6l2.5 3.3c.6.8.9 1.7.9 2.7 0 3.6-2.5 7.3-5.4 7.3S6.6 15.8 6.6 12.2c0-1 .3-1.9.9-2.7z"/><path d="M11 16.5h2l-1 1.2z"/>`,
  lukk: `<path d="M6 6l12 12"/><path d="M18 6 6 18"/>`,
  sjekk: `<path d="m5 12.5 4.5 4.5L19 7.5"/>`,
  stjerne: `<path d="m12 3 2.6 5.5 6 .7-4.4 4.1 1.1 5.9L12 16.3 6.7 19.2l1.1-5.9-4.4-4.1 6-.7z"/>`,
};

/** Gir SVG-koden for et ikon. Ukjent navn gir tom streng. */
export function ikon(navn, klasse = "") {
  const sti = STI[navn];
  if (!sti) return "";
  return `<svg class="ikon ${klasse}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${sti}</svg>`;
}
