# TPTHK kasserer

Nettside (PWA) for kassereren i Trøndelag Politis Tjenestehundklubb. Kan legges på hjemskjermen og brukes som en app.

**Adresse:** https://tpthk.no (se [docs/eget-domene.md](docs/eget-domene.md) for oppsettet av domenet)

**Oppsett:** Se [docs/firebase-oppsett.md](docs/firebase-oppsett.md) for steg-for-steg.

## Hva den gjør

**For kassereren**
- Oversikt med saldo, årets inntekter, utgifter og resultat, og sum per kategori
- Føre inntekter og utgifter med bilagsnummer (foreslås automatisk) og kvittering (bilde eller PDF)
- Egne kategorier som kan legges til og fjernes
- Medlemsliste med kontingent per år, som kan føres rett inn som inntekt
- Behandle refusjonssøknader fra medlemmene: godkjenn, avslå eller marker som utbetalt (blir en utgift i regnskapet med kvitteringene vedlagt)
- Årsrapport til årsmøtet med resultatregnskap, saldo og valgfri bilagsliste, klar for utskrift/PDF
- Eksport av poster og medlemmer til Excel (CSV)
- Overlevering til ny kasserer fra innstillingene

**For medlemmene**
- Opprette konto og be om tilgang
- Sende søknad om refusjon av utlegg med kvitteringer, og følge status
- Se om kontingenten er registrert, og hvor den skal betales

## Teknisk

- Ren HTML, CSS og JavaScript (ingen byggesteg). Alt ligger i `public/`.
- Firebase Authentication (e-post/passord med bekreftet e-post) og Cloud Firestore.
- Kvitteringer krympes i nettleseren og lagres i Firestore, så gratisplanen Spark holder (Firebase Storage krever betalingsplan).
- Tilgang styres av `firestore.rules`. Samlingen `brukere` (dokument-ID = e-post) gir rollen `kasserer` eller `medlem`.
- Publiseres til GitHub Pages med `.github/workflows/publiser.yml` ved hver endring på `main`.

### Datamodell

| Samling | Innhold |
|---|---|
| `brukere/{epost}` | `rolle`, `navn`, `medlemId`, `kontonummer` |
| `foresporsler/{epost}` | Nye brukere som ber om tilgang |
| `poster` | `type` (inntekt/utgift), `dato` (ÅÅÅÅ-MM-DD), `belop` (øre), `kategori`, `beskrivelse`, `bilagsnr`, `kvitteringIds` |
| `kvitteringer` | Komprimert bilde/PDF som data-URL, `eier` |
| `medlemmer` | `navn`, `epost`, `telefon`, `hund`, `aktiv`, `kontingent.{år}` |
| `soknader` | Refusjonssøknader: `epost`, `navn`, `formaal`, `dato`, `belop`, `kontonummer`, `status`, `kvitteringIds` |
| `innstillinger/klubb` | Klubbinfo, startsaldo, kategorier (bare kasserer) |
| `innstillinger/medlemsinfo` | Kontingent og betalingsinfo (synlig for medlemmer) |

### Teste lokalt (for den som vil)

Krever Node og Java. Fra mappen til repoet:

```
npx firebase-tools emulators:start --only auth,firestore --project demo-tpthk
```

Server `public/` på `localhost` (f.eks. `npx serve public`) og åpne siden med `?emulator` på slutten av adressen.
