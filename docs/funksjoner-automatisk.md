# Skyfunksjoner (Cloud Functions)

Noen ting kan ikke nettsiden gjøre selv, fordi de krever full tilgang til Firebase. De gjøres av små programmer
som kjører hos Google, i Belgia (`europe-west1`). De ligger i mappa `functions/` i repoet.

| Funksjon | Hva den gjør |
|---|---|
| `slettInnloggingForMedlem` | Når et medlem slettes under **Medlemmer**, slettes også innloggingen (kontoen i Firebase Authentication). Forespørselen om tilgang og fôrabonnementet ryddes bort. Søknader, kvitteringer og fôrbestillinger beholdes, fordi de hører til regnskapet og fôrrunden. Innloggingen beholdes hvis personen fortsatt har tilgang (f.eks. kasserer eller revisor), eller hvis e-posten står på et annet medlem. |

**Pris:** Gratis i praksis. Google gir 2 millioner kjøringer i måneden gratis, og funksjonen kjører bare når noen slettes.

Funksjonene publiseres av GitHub-jobben **Publiser skyfunksjonene** hver gang noe i `functions/` flettes inn på `main`.
Den bruker samme nøkkel som sikkerhetsreglene (`FIREBASE_SERVICE_ACCOUNT`), men nøkkelen må først få lov til å publisere funksjoner.
Det gjøres én gang.

## Steg 1: Finn navnet på nøkkelen

1. Gå til **https://console.firebase.google.com/project/tpthk-3405f/settings/serviceaccounts/adminsdk**
   (logg inn med Google-kontoen som eier Firebase-prosjektet).
2. Øverst står en adresse som begynner med `firebase-adminsdk-` og slutter med `@tpthk-3405f.iam.gserviceaccount.com`.
   Det er nøkkelen. Husk de første bokstavene etter `firebase-adminsdk-`.

## Steg 2: Gi nøkkelen flere roller i Google Cloud

1. Gå til **https://console.cloud.google.com/iam-admin/iam?project=tpthk-3405f**.
2. Sjekk at det står **tpthk-3405f** øverst på siden.
3. Finn raden med `firebase-adminsdk-…` i kolonnen **Principal**. (Bruk søkefeltet **Filter** over lista hvis den er lang.)
4. Trykk blyanten ✏️ helt til høyre på den raden (**Edit principal**).
5. Trykk **+ Add another role**. Klikk i feltet **Select a role**, skriv navnet på rollen og velg den i lista.
   Gjør dette for hver av disse seks:

   | Skriv | Velg |
   |---|---|
   | `Firebase Admin` | **Firebase Admin** |
   | `Cloud Functions Admin` | **Cloud Functions Admin** |
   | `Service Account User` | **Service Account User** |
   | `Cloud Build Editor` | **Cloud Build Editor** |
   | `Artifact Registry Administrator` | **Artifact Registry Administrator** |
   | `Service Usage Admin` | **Service Usage Admin** |

   Rollene som står der fra før, skal stå. Ikke fjern noe.
6. Trykk **Save**.

## Steg 3: Publiser funksjonen

1. Gå til **https://github.com/stillerflaten/TPTHK/actions**.
2. Velg **Publiser skyfunksjonene** i lista til venstre.
3. Trykk **Run workflow** til høyre, og så den grønne knappen **Run workflow**.
4. Første gang tar det 3–5 minutter. Oppdater siden. Grønn hake betyr at funksjonen er publisert.

Får du rødt kryss: trykk på jobben og på steget **Publiser funksjonene**, ta et skjermbilde av den røde teksten nederst og send det i tråden.
Står det `Permission` eller `denied`, mangler nøkkelen en rolle, og teksten sier som regel hvilken.
Har du nettopp gitt rollene, kan det også hjelpe å vente 5 minutter og kjøre jobben igjen.

## Se at det virker

1. Lag et testmedlem under **Medlemmer** med en e-post du har tilgang til, og huk av for innlogging.
2. Lag konto på https://tpthk.no med den e-posten, og sjekk at du kommer inn.
3. Logg inn som kasserer igjen og slett testmedlemmet.
4. Gå til **https://console.firebase.google.com/project/tpthk-3405f/authentication/users**. Etter noen sekunder er e-posten borte fra lista.

Vil du se hva funksjonen har gjort: **https://console.cloud.google.com/logs/query?project=tpthk-3405f**, og søk etter `slettInnloggingForMedlem`.

## Medlemmer som ble slettet før dette

Funksjonen rydder bare når et medlem slettes fra nå av. Innlogginger til medlemmer som ble slettet tidligere, sletter du for hånd:

1. Gå til **https://console.firebase.google.com/project/tpthk-3405f/authentication/users**.
2. Søk etter e-posten.
3. Trykk de tre prikkene ⋮ helt til høyre på raden → **Delete account** → **Delete**.

Ikke slett innlogginger til folk som står i medlemslisten, eller som nettopp har bedt om tilgang.
