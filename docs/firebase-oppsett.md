# Oppsett av Firebase og publisering, steg for steg

Dette gjør du én gang. Alt foregår i nettleseren, du trenger ikke Terminal.
Regn med 20–30 minutter. Firebase-konsollen endrer utseende innimellom, så knappene kan hete litt annerledes enn her. Står du fast, ta et skjermbilde og send det i tråden.

Du trenger:
- En Google-konto (den du vil skal «eie» klubbens Firebase-prosjekt)
- Tilgang til GitHub-repoet `stillerflaten/TPTHK`

> **Tips til overlevering:** Bruk gjerne en Google-konto som tilhører klubben (f.eks. en felles kasserer-konto) i stedet for din private. Da kan dere gi den videre til neste kasserer. Du kan uansett legge til flere eiere senere under ⚙️ → *Users and permissions*.

---

## Steg 1: Lag Firebase-prosjektet

1. Gå til **https://console.firebase.google.com** og logg inn med Google-kontoen.
2. Trykk **Create a project** (eller *Opprett et prosjekt*).
3. Prosjektnavn: `tpthk-kasserer` → **Continue**.
4. Gemini / AI-assistanse: valgfritt, du kan slå det av → **Continue**.
5. **Google Analytics: slå det AV** (trengs ikke) → **Create project**.
6. Vent til det står at prosjektet er klart → **Continue**.

Prosjektet er nå på gratisplanen **Spark**. Den holder lenge for en klubb, og du trenger ikke legge inn betalingskort.

## Steg 2: Registrer nettsiden og hent oppsettet

1. På forsiden av prosjektet (Project Overview): trykk **+ Add app**, og velg **Web** (ikonet **`</>`**).
2. App nickname: `TPTHK kasserer`.
3. **IKKE** huk av for «Also set up Firebase Hosting».
4. Trykk **Register app**.
5. Du får se en kodeblokk som starter med `const firebaseConfig = {`. Den inneholder `apiKey`, `authDomain`, `projectId` osv.
6. **Kopier hele blokken** og lim den inn i tråden til Claude, så legger jeg den inn for deg.
   (Vil du gjøre det selv: åpne `public/js/firebase-config.js` på GitHub, trykk blyanten ✏️, bytt ut `LIM-INN-HER`-verdiene og trykk **Commit changes**.)
7. Trykk **Continue to console**.

Det er helt greit at disse verdiene ligger åpent på GitHub. De er ikke passord, de sier bare hvilket prosjekt nettsiden skal snakke med. Sikkerheten ligger i reglene i steg 4.

## Steg 3: Slå på innlogging

1. I menyen til venstre: **Build → Authentication** (eller *Security → Authentication*) → **Get started**.
2. Under fanen **Sign-in method**: velg **Email/Password**.
3. Slå på den øverste bryteren **Email/Password**. La «Email link (passwordless sign-in)» være av. → **Save**.
4. Fortsatt inne i **Authentication** (ikke tannhjulet for prosjektinnstillinger): gå til fanen **Settings** øverst → **Authorized domains** → **Add domain** → skriv `stillerflaten.github.io` → **Add**.
5. Fortsatt under **Settings**: finn **User actions** og sjekk at **Enable create (sign-up)** er PÅ. (Medlemmene lager kontoen selv. De får likevel ikke se noe før du har gitt dem tilgang.)
6. Valgfritt, men fint: fanen **Templates** → trykk på blyanten ved *Template language* → velg **Norwegian** → **Save**. Da blir e-postene om bekreftelse og nytt passord på norsk.

## Steg 4: Lag databasen og lim inn sikkerhetsreglene

1. I menyen: **Build → Firestore Database** → **Create database**.
2. Edition: velg **Standard** hvis du blir spurt.
3. Location: velg **eur3 (europe-west)**. Dette kan ikke endres senere, så sjekk at det står Europa. → **Next**.
4. Velg **Start in production mode** → **Create**.
5. Når databasen er laget: gå til fanen **Rules**.
6. Slett alt som står der, og lim inn **hele innholdet** fra fila [`firestore.rules`](../firestore.rules) i repoet.
   (Åpne fila på GitHub, trykk kopier-ikonet øverst til høyre over innholdet.)
7. Trykk **Publish**.

## Steg 5: Slå på publisering av nettsiden (GitHub Pages)

1. Gå til **https://github.com/stillerflaten/TPTHK** → **Settings** (tannhjulet i repoet, ikke på profilen din).
2. I menyen til venstre: **Pages**.
3. Under **Build and deployment → Source**: velg **GitHub Actions**.
4. Gå til fanen **Actions** øverst i repoet. Hvis «Publiser nettsiden» ikke har kjørt, trykk på den → **Run workflow** → **Run workflow**.
5. Når den har grønn hake (et par minutter), ligger nettsiden på
   **https://stillerflaten.github.io/TPTHK/**

> Nettsiden bruker nå domenet **tpthk.no**. Se [eget-domene.md](eget-domene.md) for hvordan det er satt opp. Den gamle adressen sender folk videre automatisk.

## Steg 6: Gjør deg selv til kasserer

Dette er det eneste som må gjøres direkte i databasen. Alle senere brukere styrer du fra nettsiden.

1. Åpne **https://tpthk.no**
2. Trykk **Ny bruker? Opprett konto**, bruk e-posten din og velg et passord.
3. Åpne e-posten fra Firebase og trykk på lenken. Gå tilbake til nettsiden og trykk **Jeg har bekreftet**.
4. Du ser nå «Be om tilgang». La siden stå åpen.
5. I Firebase-konsollen: **Firestore Database → Data** → **+ Start collection**.
   - Collection ID: `brukere` → **Next**
   - Document ID: **e-postadressen din med små bokstaver**, f.eks. `silje@eksempel.no`
   - Legg til felt: Field `rolle`, Type `string`, Value `kasserer`
   - Trykk **Add field**: Field `navn`, Type `string`, Value `Silje`
   - **Save**
6. Gå tilbake til nettsiden. Den slipper deg inn automatisk (ellers: last siden på nytt).

## Steg 7: Første gangs innstillinger på nettsiden

Gå til **⚙️ Innstillinger** og fyll inn:
- **Kontingent per år** og **klubbens kontonummer** (vises for medlemmene på «Min side»)
- **Startsaldo**: hva som står på klubbens konto den dagen dere begynner å bruke nettsiden, og den datoen
- **Kategorier**: legg til eller fjern så det passer klubben

## Steg 8: Legg den på hjemskjermen

- **iPhone:** Åpne adressen i **Safari** → Del-knappen ⬆️ → **Legg til på Hjem-skjerm**.
- **Android:** Åpne i **Chrome** → menyen ⋮ → **Legg til på startskjermen** / **Installer app**.

Da får dere TPTHK-logoen som app-ikon, og den åpnes uten adresselinje.

---

## Slik får medlemmene tilgang

1. Del adressen **https://tpthk.no** med medlemmene.
2. De trykker **Opprett konto**, bekrefter e-posten og skriver navnet sitt under «Be om tilgang».
3. Du ser forespørselen under **Medlemmer** (og på Oversikt). Trykk **Gi tilgang**.
   Har du allerede lagt inn medlemmet med samme e-post, blir kontoen koblet til det.
4. De kan nå sende søknader om refusjon og se om kontingenten er registrert.

Medlemmer ser **aldri** regnskapet, andre medlemmer eller andres søknader. Det er sikret i databasereglene, ikke bare skjult på skjermen.

## Når det kommer ny kasserer

1. Sørg for at den nye kassereren har konto og tilgang (som et vanlig medlem).
2. **Innstillinger → Kasserere → Gjør til kasserer**.
3. Den nye kassereren fjerner deg som kasserer etterpå.
4. Husk også å gi den nye kassereren eierskap i Firebase-konsollen (⚙️ → *Users and permissions*) og i GitHub-repoet.

## Support fra administratoren

Administratoren (den som drifter nettsiden, merket `admin: true`) er vanlig medlem og ser **ikke** regnskapet til vanlig.
Trenger dere hjelp, trykker kassereren **Innstillinger → Be om support i 24 timer** (styremedlemmer finner samme knapp på **Min side**).
Da får administratoren full tilgang i 24 timer. Alle ser en gul stripe så lenge supporten er på, og dere kan trykke **Avslutt support nå** når dere vil.

Tidsgrensen sjekkes i databasereglene mot Firebase sin klokke, så den kan ikke jukses med på skjermen. Under support kan administratoren ikke endre sin egen rolle.

## Om kvitteringer og lagring

Kvitteringsbilder krympes automatisk og lagres i databasen. Gratisplanen gir 1 GB, som rommer flere tusen kvitteringer. PDF-er må være under ca. 650 kB; større PDF-er kan man ta skjermbilde av i stedet.

## Sikkerhetskopi

Bruk **⬇︎ Excel** under Poster og Medlemmer jevnlig (f.eks. etter hvert årsmøte), og lagre årsrapporten som PDF. Da har dere alltid en kopi utenfor Firebase.
