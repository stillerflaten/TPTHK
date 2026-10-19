# E-postvarsel om nye søknader

Når et medlem sender en søknad om refusjon, kan kassereren få en kort e-post:

> **Ny søknad om refusjon**
> Det har kommet en ny søknad om refusjon av utlegg. Logg inn på https://tpthk.no for å se den.

E-posten inneholder ingen opplysninger om søkeren eller søknaden. Den sendes fra klubbens egen Gmail-konto
av en ferdig Firebase-utvidelse («Trigger Email from Firestore»). Det koster i praksis ingenting.

Dette settes opp én gang. Alt gjøres i nettleseren og tar 15–20 minutter.

## Steg 1: Gmail-kontoen som sender e-posten

Bruk en Gmail-konto som tilhører klubben (ikke din private), for eksempel `tpthk.kasserer@gmail.com`.
Har klubben ingen, lag en på https://accounts.google.com/signup. Den kan også brukes som eier av Firebase-prosjektet senere.

1. Logg inn på kontoen og gå til **https://myaccount.google.com/security**.
2. Slå på **2-trinnsbekreftelse** (2-Step Verification) hvis den ikke er på. Det kreves for neste steg.
3. Gå til **https://myaccount.google.com/apppasswords**.
4. Skriv `TPTHK nettside` som navn og trykk **Opprett**.
5. Du får et passord på 16 bokstaver. **Kopier det** og ha det klart til steg 2. Det vises bare én gang.

## Steg 2: Installer utvidelsen i Firebase

1. Gå til **https://console.firebase.google.com/project/tpthk-3405f/extensions** (logg inn med kontoen som eier prosjektet).
2. Trykk **Explore extensions** (eller **Install extension**), søk etter **Trigger Email from Firestore** og trykk på den.
3. Trykk **Install in Firebase console** og velg prosjektet **tpthk-3405f**.
4. Gå gjennom stegene. Ber den deg slå på noen tjenester (Artifact Registry, Secret Manager, Compute Engine), trykk **Enable** på hver og vent til den er ferdig før du trykker på neste.

Det står en rød melding om at Firebase Extensions stenges 31. mars 2027. Den kan du se bort fra nå: utvidelsen virker etter det også, men innstillingene kan ikke endres. Før den datoen bør varselet flyttes over til en egen funksjon.
5. Fyll inn innstillingene slik:

| Innstilling | Verdi |
|---|---|
| Cloud Functions location | `Belgium (europe-west1)`, så varselet behandles i Europa. Kan ikke endres senere. |
| Firestore Instance ID | `(default)` |
| Firestore Instance Location | Databasen ligger i `eur3`. I lista heter det «Multi-region (Europe …)». Ikke velg United States. |
| Authentication Type | `Username & Password` |
| SMTP connection URI | `smtps://tpthk.kasserer@gmail.com@smtp.gmail.com:465` (bytt til klubbens Gmail-adresse) |
| SMTP password | Passordet på 16 bokstaver fra steg 1 (uten mellomrom) |
| Email documents collection | `mail` |
| Default FROM address | `TPTHK <tpthk.kasserer@gmail.com>` (klubbens Gmail-adresse) |

Resten kan stå som det er. Trykk **Install extension**. Det tar 3–5 minutter før den er ferdig.

Får du feilen «Permission denied while using the Eventarc Service Agent» første gang: vent 5 minutter og trykk **Retry installing** (ikke Uninstall). Google trenger litt tid på å gi den nye tjenesten tilgang.

## Steg 3: Velg hvem som skal få varselet

1. Logg inn på https://tpthk.no som kasserer (eller be Mona gjøre det).
2. Gå til **Innstillinger** → **Varsel om nye søknader**.
3. Skriv inn e-postadressen som skal få varselet (Mona sin) og trykk **Lagre**.

## Test

Send en test-søknad med deg selv (et annet medlem enn den som får varselet), og sjekk at e-posten kommer i løpet av et minutt.
Se også i søppelpost første gang. Trekk test-søknaden etterpå.

Kommer det ingen e-post: Firebase-konsollen → **Firestore** → samlingen `mail`. Varselet står der med feltet
`delivery`, og under `delivery.error` står det hva som gikk galt (oftest feil passord i steg 2).

## Bytte mottaker eller slå det av

Endre eller tøm feltet under **Innstillinger → Varsel om nye søknader**. Tomt felt betyr at ingen e-post sendes.
Ny kasserer: husk å bytte adressen her ved overlevering.
