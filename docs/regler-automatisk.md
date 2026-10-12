# Automatisk publisering av sikkerhetsreglene

Når `firestore.rules` endres på `main`, kan GitHub publisere reglene til Firebase av seg selv.
Da slipper du å lime dem inn i Firebase-konsollen. Dette settes opp én gang, og alt gjøres i nettleseren.

## Steg 1: Lag en nøkkel i Firebase

1. Gå til **https://console.firebase.google.com** og åpne prosjektet **tpthk-3405f**.
2. Trykk tannhjulet ⚙️ øverst til venstre → **Project settings**.
3. Velg fanen **Service accounts**.
4. Trykk **Generate new private key** → **Generate key**.
5. En fil med navn som slutter på `.json` lastes ned. **Denne fila er et passord til databasen.** Ikke send den til noen, og ikke legg den i repoet.

## Steg 2: Legg nøkkelen inn som hemmelighet på GitHub

1. Gå til **https://github.com/stillerflaten/TPTHK** → **Settings** (tannhjulet i repoet).
2. I menyen til venstre: **Secrets and variables → Actions**.
3. Trykk **New repository secret**.
4. Name: `FIREBASE_SERVICE_ACCOUNT`
5. Secret: åpne `.json`-fila fra steg 1 i TextEdit, merk alt (Cmd + A), kopier (Cmd + C) og lim inn her.
6. Trykk **Add secret**.
7. Slett `.json`-fila fra Nedlastinger og tøm papirkurven. GitHub har nå en sikker kopi.

## Steg 3: Test at det virker

1. Gå til fanen **Actions** i repoet.
2. Velg **Publiser sikkerhetsreglene** i lista til venstre → **Run workflow** → **Run workflow**.
3. Etter et minutt eller to skal det stå en grønn hake. Da er reglene publisert.
   Er det et rødt kryss, ta et skjermbilde og send det i tråden.

Etter dette publiseres reglene automatisk hver gang en endring i `firestore.rules` flettes inn på `main`.
