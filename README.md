# BetterOV

Advertentievrije OV-webapp (PWA) voor eigen gebruik en een kleine kring vrienden en familie. Het verschil met 9292: de app **bewaakt je reis** en geeft **alternatieven als het misgaat**. Totale kosten: €0, zonder creditcard.

- **Frontend en API:** SvelteKit als Cloudflare Worker (gratis). De NS-key blijft op de server.
- **Achtergrondtaken:** aparte Cloudflare Worker met een cron elke minuut (`cron/`).
- **Accounts, data en push:** Firebase (gratis Spark-plan): Auth (Google-login + allowlist), Firestore en Cloud Messaging.
- **Routeplanning:** [Transitous](https://transitous.org) (MOTIS); na 4 s zonder antwoord de NS-planner.
- **Kaart:** MapLibre met OpenFreeMap.

## Functies

| ID | Functie | Waar |
| --- | --- | --- |
| M1–M2 | Plannen van adres, halte, station, favoriete plek of GPS; datum/tijd, vertrek/aankomst, via; eerder/later | Plannen |
| M3 | Tussenstops, perrons, overstapmarge (rood onder 3 min), spoorwijziging gemarkeerd | Reisadvies |
| M4, M15, M16 | Voorkeur snelst / minste overstappen / goedkoopst / minst druk (wisselen herberekent) | Resultaten |
| M5 | Vertrekbord per halte of in de buurt, ververst elke 30 s | Vertrek |
| M6 | *Nu vertrekken*: looptijd vanaf GPS en aftelling | Reisadvies |
| M7, M8 | Actieve reis met één tik; ververst bij openen en elke 30 s; alternatieven vanaf het overstappunt | Reis |
| M9 | Pushmelding binnen 2 min bij uitval, onhaalbare overstap, spoorwijziging, vertraging | Cron-worker |
| M10 | Live kaart met eigen positie en (geschatte of GPS-)positie van het voertuig | Reis → Live kaart |
| M11 | Fallback naar de NS-planner, met melding | Server |
| M12 | Laatste data blijft zichtbaar bij slecht bereik, met tijdstip van ophalen | Overal |
| M13 | Favoriete reizen en plekken | Favorieten |
| M14 | Google-login alleen voor de allowlist, sync tussen apparaten | Login, Meer → Beheer |
| M17–M19 | Instapadvies (eerste klas, stilte), waarschuwing kortere trein, voertuiginfo | Trein & instapadvies |
| M20 | Laatste verbinding naar huis met resterende speling | Plannen |
| M21 | Reis live delen via een link zonder login | Reis → Deel live |
| M22 | Agenda-export (.ics) | Reisadvies, Reis |
| C1, C2 | Eerdere reizen, weekplanning van vaste reizen | Meer |

## Lokaal proberen

```bash
npm install
npm run dev:mock      # nepdata, geen internet naar Transitous/NS nodig
# of: npm run dev     # echte Transitous-data (en NS als NS_API_KEY in .env staat)
```

Zonder Firebase-config draait de app in **demo-modus**: geen login, gegevens alleen in je browser. Online werkt demo-modus alleen met `DEMO_MODUS=1`, zodat de API niet per ongeluk openstaat.

Tests: `npm test` (unit), `npm run test:e2e` (Playwright, met nepdata), `npm run check` (types).

## Stappenplan: zelf te doen (±25 minuten)

Dit kan alleen met je eigen accounts. Alles is gratis en vraagt geen creditcard.

### 1. Repository openbaar maken
Transitous is alleen gratis voor open-source projecten. Maak de repo openbaar: GitHub → *Settings* → *General* → onderaan *Change visibility* → *Public*. (Er staan geen geheimen in de code.)

### 2. NS API-key
1. Ga naar [apiportal.ns.nl](https://apiportal.ns.nl) en maak een account.
2. *Products* → **Ns-App** → *Subscribe*. Staat **Virtual Train API** er apart bij, abonneer daar ook op.
3. *Profile* → kopieer de **Primary key**.

### 3. Firebase
1. [console.firebase.google.com](https://console.firebase.google.com) → *Project toevoegen* → naam `betterov` → Google Analytics uit.
2. **Authentication** → *Aan de slag* → *Sign-in method* → **Google** → inschakelen → opslaan.
3. **Firestore Database** → *Database maken* → locatie `eur3 (europe-west)` → *productiemodus*. Open daarna het tabblad **Regels**, vervang alles door de inhoud van [`firestore.rules`](firestore.rules) en klik *Publiceren*.
4. ⚙️ *Projectinstellingen* → *Algemeen* → *Je apps* → web-icoon `</>` → naam `betterov` → **geen** Hosting → *App registreren*. Bewaar het `firebaseConfig`-blok.
5. *Projectinstellingen* → **Cloud Messaging** → *Web Push-certificaten* → *Sleutelpaar genereren*. Bewaar de sleutel.
6. *Projectinstellingen* → **Serviceaccounts** → *Nieuwe privésleutel genereren*. Bewaar het JSON-bestand goed: dit is geheim.

### 4. Cloudflare
1. Maak een gratis account op [dash.cloudflare.com](https://dash.cloudflare.com) en open *Workers & Pages* één keer (daarmee kies je je `workers.dev`-subdomein).
2. Kopieer je **Account ID** (rechts op de overzichtspagina van *Workers & Pages*).
3. *My Profile* → *API Tokens* → *Create Token* → sjabloon **Edit Cloudflare Workers** → *Continue* → *Create Token*. Kopieer de token.

### 5. GitHub-instellingen
GitHub → *Settings* → *Secrets and variables* → *Actions*.

**Secrets** (tabblad *Secrets*):

| Naam | Waarde |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | token uit stap 4.3 |
| `CLOUDFLARE_ACCOUNT_ID` | account-ID uit stap 4.2 |
| `NS_API_KEY` | key uit stap 2 |
| `FIREBASE_SERVICE_ACCOUNT` | de volledige inhoud van het JSON-bestand uit stap 3.6 |
| `ADMIN_EMAILS` | jouw Gmail-adres (meerdere gescheiden door komma's) |

**Variables** (tabblad *Variables*), uit `firebaseConfig` en stap 3.5:

| Naam | Waarde |
| --- | --- |
| `PUBLIC_FIREBASE_API_KEY` | `apiKey` |
| `PUBLIC_FIREBASE_PROJECT_ID` | `projectId` |
| `PUBLIC_FIREBASE_APP_ID` | `appId` |
| `PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
| `PUBLIC_FIREBASE_VAPID_KEY` | Web Push-sleutel |

> De webconfig is niet geheim. Je mag hem ook gewoon naar mij sturen; dan zet ik hem in `wrangler.jsonc`.

### 6. Uitrollen
Merge de pull request naar `main`. De GitHub Action test, bouwt en rolt de app en de cron-worker uit. De app staat daarna op `https://betterov.<jouw-subdomein>.workers.dev`.

### 7. Domein toestaan in Firebase
Firebase → *Authentication* → *Settings* → *Authorized domains* → *Add domain* → `betterov.<jouw-subdomein>.workers.dev`.

**Aanbevolen voor iPhone** (inloggen vanuit de app op het beginscherm):
1. Zet de GitHub-variabele `PUBLIC_FIREBASE_AUTH_DOMAIN` op `betterov.<jouw-subdomein>.workers.dev` en rol opnieuw uit (*Actions* → *Testen en uitrollen* → *Run workflow*).
2. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) (zelfde project) → *OAuth 2.0 Client IDs* → *Web client (auto created by Google Service)* → *Authorized redirect URIs* → toevoegen: `https://betterov.<jouw-subdomein>.workers.dev/__/auth/handler`.

### 8. In gebruik nemen
Open de app, log in met Google en nodig mensen uit via *Meer* → *Beheer: uitnodigingen*. Op iPhone: Safari → *Deel* → *Zet op beginscherm*, daarna meldingen aanzetten via *Meer* → *Instellingen*.

## Architectuur

| Route | Doet |
| --- | --- |
| `GET /api/plan` | Plant via Transitous (voorkeur, via-station); na 4 s via NS. Verrijkt met drukte en prijs |
| `GET /api/vertrektijden` | Vertrekbord voor een halte, station of de buurt |
| `GET /api/trein/{ritnummer}` | Samenstelling, drukte, lengte t.o.v. normaal, materieel en instapadvies |
| `GET/POST /api/prijs` | NS-prijs tussen stations, of prijs/schatting voor een heel advies |
| `GET /api/laatste-verbinding` | Laatste reis naar huis vanaf de huidige locatie |
| `POST /api/reisstatus` | Ververst een lopende reis en geeft de problemen |
| `GET /api/rit`, `/api/voertuig`, `/api/zoek`, `/api/omgekeerd` | Rit met alle haltes, treinpositie, zoeken, adres bij GPS |
| Cron (elke minuut) | Controleert actieve reizen, stuurt push, rondt reizen af, ruimt gedeelde reizen op |

Datamodel zoals in de projectomschrijving, met twee toevoegingen:
- `actieveReizen/{uid}`: compacte kopie van de actieve reis, zodat de cron alleen actieve reizen leest (geen extra index nodig).
- `users/{uid}/plekken/{id}`: favoriete plekken (werk, oma, …).

## Beperkingen en nog te controleren

- **NS-treinsamenstelling:** de Virtual Train API is niet openbaar gedocumenteerd en kon hier niet live getest worden. Het instapadvies leest per bak eerste klas en stilte als de data dat bevat, en valt anders terug op per treinstel. In het voertuiginfo-scherm staat *Ruwe NS-data*: daarmee is de verwerking snel bij te stellen zodra de key werkt.
- **Voertuignummer bus/tram:** staat niet in de open data van Transitous; de app zegt dat eerlijk.
- **Busprijzen** zijn schattingen (`src/lib/data/tarieven.json`); elk jaar in januari bijwerken.
- **Push op iOS** werkt alleen als de app op het beginscherm staat; de app legt dat uit bij de eerste login.
- **Gratis limieten:** locatie delen schrijft hooguit elke minuut; de cron leest alleen actieve reizen en blijft onder 45 verzoeken per run.
