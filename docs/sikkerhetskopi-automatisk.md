# Automatisk sikkerhetskopi

Google kan ta en kopi av hele databasen hver natt. Kopien ligger hos Google i 14 dager, og så slettes den av seg selv.
Den er et sikkerhetsnett hvis noe blir slettet ved et uhell, eller hvis noen skulle ødelegge data med vilje.

Knappen **Last ned sikkerhetskopi** under Innstillinger skal fortsatt brukes. Den gir klubben en kopi utenfor Google,
og det er den kassereren selv kan legge tilbake med **Gjenopprett fra sikkerhetskopi**.

**Pris:** Kopiene koster noen få øre i måneden, fordi databasen er liten. Det krever Blaze-planen, som prosjektet allerede er på.

## Slå det på (én gang)

Alt gjøres i nettleseren.

1. Gå til **https://github.com/stillerflaten/TPTHK** og velg fanen **Actions**.
2. Velg **Slå på automatisk sikkerhetskopi** i lista til venstre.
3. Trykk **Run workflow** til høyre, og så den grønne knappen **Run workflow**.
4. Vent et minutt og oppdater siden. Grønn hake betyr at det er slått på.

Får du rødt kryss, har ikke nøkkelen lov til å gjøre dette. Bruk da framgangsmåten under.

## Hvis GitHub-jobben feiler: slå det på i Google Cloud

1. Gå til **https://console.cloud.google.com/firestore/databases** og logg inn med Google-kontoen som eier Firebase-prosjektet.
2. Sjekk at prosjektet **tpthk-3405f** er valgt øverst på siden.
3. Trykk på databasen **(default)**.
4. Velg **Disaster recovery** i menyen til venstre.
5. Trykk **Edit** (eller **Create backup schedule**) ved «Backups».
6. Velg **Daily** og at kopiene skal beholdes i **14 days**. Trykk **Save**.

## Se at det virker

Kjør **Slå på automatisk sikkerhetskopi** igjen (steg 1–3 over), og trykk på jobben. Under «Slå på og vis sikkerhetskopiene»
står det hvilke kopier som finnes, og når de slettes. Den første kopien kommer natten etter at det er slått på.

I Google Cloud ser du det samme under **Disaster recovery**.

## Hente data tilbake fra en slik kopi

Det gjør man sjelden, og det krever litt teknisk hjelp: Google legger kopien tilbake som en egen database ved siden av den
vanlige, og så må det som skal tilbake, flyttes over. Be den som drifter nettsiden om hjelp, eller gi denne veiledningen til
Claude. Det viktigste er å handle før det har gått 14 dager.

Kort fortalt: Google Cloud → Firestore → **(default)** → **Disaster recovery** → velg kopien → **Restore** → gi den nye
databasen et navn (f.eks. `gjenoppretting`). Deretter kopieres de dokumentene som mangler, over til `(default)`, og
`gjenoppretting` slettes.
