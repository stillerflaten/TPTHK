# Eget domene: tpthk.no

Nettsiden skal ligge på **https://tpthk.no** i stedet for https://stillerflaten.github.io/TPTHK/.
Selve koden trenger ingen endring, fordi alle stier i appen er relative. Det som gjenstår er tre ting du gjør i nettleseren, i denne rekkefølgen:

1. DNS hos domeneleverandøren (der dere kjøpte tpthk.no)
2. Firebase: godkjenn det nye domenet for innlogging
3. GitHub: koble domenet til nettsiden og slå på HTTPS

Gjør Firebase-steget **før** GitHub-steget. Ellers kan ingen logge inn i tiden mellom.

---

## Steg 1: DNS hos domeneleverandøren

Logg inn der tpthk.no er registrert (f.eks. Domeneshop, One.com, GoDaddy) og finn **DNS**, *DNS-innstillinger*, *DNS-pekere* eller lignende for tpthk.no.

**Slett først** eventuelle gamle oppføringer som peker et annet sted for selve domenet (`@` / tom) og for `www`, av typene **A**, **AAAA** og **CNAME**. Ikke rør **MX**- eller **TXT**-oppføringer; de gjelder e-post.

Legg så inn disse. «Navn/Host» er tomt eller `@` for selve domenet (leverandørene skriver det litt ulikt):

| Type  | Navn / Host | Verdi                     |
|-------|-------------|---------------------------|
| A     | @ (tom)     | `185.199.108.153`         |
| A     | @ (tom)     | `185.199.109.153`         |
| A     | @ (tom)     | `185.199.110.153`         |
| A     | @ (tom)     | `185.199.111.153`         |
| AAAA  | @ (tom)     | `2606:50c0:8000::153`     |
| AAAA  | @ (tom)     | `2606:50c0:8001::153`     |
| AAAA  | @ (tom)     | `2606:50c0:8002::153`     |
| AAAA  | @ (tom)     | `2606:50c0:8003::153`     |
| CNAME | www         | `stillerflaten.github.io` |

Lagre. Endringene kan bruke fra noen minutter til noen timer på å slå gjennom.

> Får du ikke lov til å legge inn AAAA, er det greit å hoppe over dem. A-oppføringene og CNAME er det viktigste.

## Steg 2: Firebase – godkjenn domenet for innlogging

1. Gå til **https://console.firebase.google.com** → prosjektet **tpthk-3405f**.
2. **Build → Authentication** → fanen **Settings** → **Authorized domains**.
3. **Add domain** → skriv `tpthk.no` → **Add**.
4. **Add domain** igjen → skriv `www.tpthk.no` → **Add**.
5. La `stillerflaten.github.io` stå. Den skader ikke.

## Steg 3: GitHub – koble domenet til nettsiden

1. Gå til **https://github.com/stillerflaten/TPTHK** → **Settings** (tannhjulet i repoet) → **Pages** i menyen til venstre.
2. Under **Custom domain**: skriv `tpthk.no` → **Save**.
3. GitHub sjekker DNS-en. Vent til det står **DNS check successful** (grønn hake). Står det feil, har DNS-en ikke slått gjennom ennå; vent litt og trykk **Check again**.
4. Når sjekken er grønn, huk av **Enforce HTTPS**. Er boksen grå, holder GitHub fortsatt på å lage sikkerhetssertifikatet. Det kan ta opptil et døgn; kom tilbake senere og huk av da.

Ferdig! Test ved å åpne **https://tpthk.no** og logge inn. Også `www.tpthk.no` og den gamle adressen sender folk dit automatisk.

### Valgfritt, men lurt: verifiser domenet i GitHub

Dette hindrer at noen andre kan «låne» domenet ditt på GitHub hvis nettsiden en dag blir slått av.

1. Trykk på profilbildet ditt øverst til høyre på GitHub → **Settings** → **Pages** (i menyen til venstre, under *Code, planning, and automation*).
2. **Add a domain** → skriv `tpthk.no` → **Add domain**.
3. GitHub viser en **TXT**-oppføring (et navn som begynner med `_github-pages-challenge-stillerflaten` og en lang verdi). Legg den inn hos domeneleverandøren akkurat som i steg 1.
4. Gå tilbake og trykk **Verify**.

## For medlemmene

- Del den nye adressen **https://tpthk.no**.
- De som har lagt appen på hjemskjermen fra den gamle adressen, bør slette ikonet og legge det til på nytt fra tpthk.no. Innlogging må gjøres én gang til, men alle data ligger der som før.
