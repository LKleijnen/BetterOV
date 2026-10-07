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
| M1–M2 | Plannen van adres, halte, station, favoriete plek of GPS; datum/tijd, vertrek/aankomst; eerder/later | Plannen |
| — | Reisopties zoals in de NS-app: via, extra overstaptijd, vervoermiddelen, treinen met reservering verbergen, toegankelijk | Plannen → Reisopties |
| M3 | Tussenstops als stipjes op de lijn, op tijd verdeeld (uitgeklapt met naam en tijd), perrons, overstapmarge (rood onder 3 min), spoorwijziging gemarkeerd | Reisadvies |
| M4, M15, M16 | Adviezen op vertrektijd met labels Snelst / Minste overstappen / Goedkoopst / Rustigst; heeft alles een overstap, dan zoekt de app er een reis met minder overstappen bij | Reisadviezen |
| M5 | Vertrekbord per halte of in de buurt, ververst elke 30 s | Vertrek |
| M6 | *Nu vertrekken*: looptijd vanaf GPS en aftelling | Reisadvies |
| M7, M8 | Actieve reis met één tik; ververst bij openen en elke 30 s; samenvatting bovenaan, bolletje dat op tijd over de lijn schuift en precies bij een stipje is als de trein bij die halte is, doorgestreepte haltes, snelheid (GPS); alternatieven vanaf het overstappunt (inklapbaar, kiezen op de detailpagina) | Reis |
| M9 | Pushmelding binnen 2 min bij uitval, onhaalbare overstap, spoorwijziging, vertraging | Cron-worker |
| — | Herinnering vóór instappen en uitstappen, zelf in te stellen (bijvoorbeeld 5 min, 1 min en 30 s); instappen pas een minuut nadat je vorige voertuig is aangekomen, uitstappen pas als je onderweg bent | Meer → Instellingen, cron-worker |
| M10 | Live kaart met eigen positie en (geschatte of GPS-)positie van het voertuig, ook vóór je instapt en na je uitstapt; de hele rit in zwart met jouw deel in geel; tussenstops als kleine grijze stipjes, met naam als je inzoomt of tikt, en link naar de stationspagina; treinen over het echte spoor (NS SpoorKaart), optioneel alle spoorlijnen | Reis en Reisadvies (kaartje, schermvullend), Voertuiginfo |
| M11 | Fallback naar de NS-planner, met melding | Server |
| M12 | Laatste data blijft zichtbaar bij slecht bereik, met tijdstip van ophalen | Overal |
| M13 | Favoriete reizen en plekken | Favorieten |
| M14 | Google-login alleen voor de allowlist, uitnodigen met een eenmalige link, sync tussen apparaten | Login, Meer → Beheer |
| M17–M19 | Voertuiginfo: trein zoals op het perron met afbeelding per bak, 1e klas en stilte boven de juiste bak (van NS of de vaste indeling van het type), drukte, haakjes per bestemming als de trein splitst (ook in de tijdlijn en het blok *Nu*), kortere trein, versie per treinstel en welke moderner is, live positie | Voertuiginfo (per rit) |
| — | Voertuigengids: alle treintypes, trams en metro's met versies, techniek, kosten, geschiedenis, leuke feiten, foto (Wikipedia) en bronnen; zoeken op naam of treinstelnummer | Meer → Voertuigen, Voertuiginfo → *Meer over …* |
| M20 | Laatste trein naar huis: 's avonds vanzelf op het startscherm als je ver van huis bent, met pushmelding 30 en 10 min voor vertrek (en bij uitval) | Plannen, Meer → Instellingen |
| M21 | Reis live delen via een link zonder login | Reis → Deel live |
| M22 | Agenda-export (.ics): één afspraak per trein/bus, met spoor en uitstaptijd | Reisadvies, Reis |
| — | Stationspagina: kaart van het station met voorzieningen (NS Places API), sporen, reisassistentie, OV-fietsen, openingstijden; bij een overstap met aankomst- en vertrekspoor | Stationsicoon bij een treinhalte, overstap |
| C1, C2 | Eerdere reizen, weekplanning van vaste reizen | Meer |
| — | Weergave automatisch (systeem), licht of donker | Meer → Instellingen |

## Lokaal proberen

```bash
npm install
npm run dev:mock      # nepdata, geen internet naar Transitous/NS nodig
# of: npm run dev     # echte Transitous-data (en NS als NS_API_KEY in .env staat)
```

Zonder Firebase-config draait de app in **demo-modus**: geen login, gegevens alleen in je browser. Online werkt demo-modus alleen met `DEMO_MODUS=1`, zodat de API niet per ongeluk openstaat.

Tests: `npm test` (unit), `npm run test:e2e` (Playwright, met nepdata), `npm run check` (types).

## Een PR proberen vóór het mergen
Bij elke PR zet de workflow een **testversie** klaar op `https://test-betterov.<jouw-subdomein>.workers.dev` (de exacte link staat bij de PR onder *Checks → Testen en uitrollen → Summary*). De echte app verandert niet. Let op: de testversie gebruikt dezelfde gegevens (favorieten, reizen) als de echte app.
- Eenmalig: Firebase → *Authentication* → *Settings* → *Authorized domains* → *Add domain* → `test-betterov.<jouw-subdomein>.workers.dev`. Open de testversie daarna gewoon in de browser (niet op het beginscherm zetten; dan werkt inloggen met een pop-up).
- Pushmeldingen komen van de cron-worker, die alleen live draait. Wil je die vóór het mergen testen: GitHub → *Actions* → *Testen en uitrollen* → *Run workflow* → kies de branch van de PR → vink **cron_van_branch** aan → *Run workflow*. Merge je de PR niet, zet de cron-worker dan terug met *Run workflow* op `main` (zonder vinkje).

## Stappenplan: zelf te doen (±25 minuten)

Dit kan alleen met je eigen accounts. Alles is gratis en vraagt geen creditcard.

### 1. Repository openbaar maken
Transitous is alleen gratis voor open-source projecten. Maak de repo openbaar: GitHub → *Settings* → *General* → onderaan *Change visibility* → *Public*. (Er staan geen geheimen in de code.)

### 2. NS API-key
1. Ga naar [apiportal.ns.nl](https://apiportal.ns.nl) en maak een account.
2. *Products* → **Ns-App** → *Subscribe* (naam bijvoorbeeld `BetterOV`). Dit product bevat alles wat de app nodig heeft: de **Reisinformatie API** en de **Virtual Train API** (plus Disruptions, Stations, Places en SpoorKaart voor later).
3. *Profile* → kopieer de **Primary key**. Eén key werkt voor alle producten waarop je geabonneerd bent.

Let op: de Reisinformatie API heeft een limiet van 300 verzoeken per 5 minuten. Voor ongeveer 20 gebruikers is dat genoeg, omdat de app antwoorden cachet.

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

**Nodig voor de app op het beginscherm** (iPhone én Android): als webapp logt de app in via zijn eigen domein (de proxy op `/__/auth/`), omdat telefoons in app-modus de opslag van `firebaseapp.com` blokkeren. Google moet dat adres kennen:
1. [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials) (bovenaan hetzelfde project kiezen als in Firebase).
2. Onder *OAuth 2.0 Client IDs* → klik op **Web client (auto created by Google Service)**.
3. Bij *Authorized redirect URIs* → *Add URI* → `https://betterov.<jouw-subdomein>.workers.dev/__/auth/handler` → **Save**. (Het kan tot 5 minuten duren voordat dit werkt.)

Optioneel: zet de GitHub-variabele `PUBLIC_FIREBASE_AUTH_DOMAIN` op `betterov.<jouw-subdomein>.workers.dev` en rol opnieuw uit; dan gebruikt ook de browser dit domein.

### 8. In gebruik nemen
Open de app, log in met Google en nodig mensen uit via *Meer* → *Beheer: uitnodigingen*: maak een uitnodigingslink en stuur die via WhatsApp of mail. Wie de link opent en inlogt met Google, krijgt meteen toegang (de link werkt één keer en is 7 dagen geldig). Een Gmail-adres direct toevoegen kan ook nog. Op iPhone: Safari → *Deel* → *Zet op beginscherm*, daarna meldingen aanzetten via *Meer* → *Instellingen*.

## Architectuur

| Route | Doet |
| --- | --- |
| `GET /api/plan` | Plant via Transitous (voorkeur, via-station); na 4 s via NS. Verrijkt met drukte en prijs |
| `GET /api/vertrektijden` | Vertrekbord voor een halte, station of de buurt |
| `GET /api/trein/{ritnummer}` | Samenstelling, drukte, lengte t.o.v. normaal, materieel en instapadvies |
| `GET/POST /api/prijs` | NS-prijs tussen stations, of prijs/schatting voor een heel advies |
| `GET /api/laatste-verbinding` | Laatste reis naar huis vanaf de huidige locatie |
| `POST /api/uitnodiging` | Uitnodigingslink inwisselen (ingelogd, nog zonder toegang) |
| `GET/POST/DELETE /api/beheer/uitnodigingen` | Uitnodigingslinks maken, tonen en intrekken (beheerder) |
| `POST /api/reisstatus` | Ververst een lopende reis en geeft de problemen |
| `GET /api/spoorkaart` | Spoorlijnen (NS SpoorKaart); de app rekent zelf de route over het spoor uit |
| `GET /api/rit`, `/api/voertuig`, `/api/zoek`, `/api/omgekeerd` | Rit met alle haltes, treinpositie, zoeken, adres bij GPS |
| `GET /api/station` | NS-station (code, of naam + lat/lon): sporen, soort, reisassistentie en voorzieningen |
| `GET/POST/DELETE /api/wekker` | Waarschuwing voor de laatste trein naar huis aan/uit (Firestore `laatsteTreinWekkers`) |
| Cron (elke minuut) | Controleert actieve reizen, stuurt push, waarschuwt voor de laatste trein naar huis, rondt reizen af, ruimt gedeelde reizen op |

Datamodel zoals in de projectomschrijving, met twee toevoegingen:
- `actieveReizen/{uid}`: compacte kopie van de actieve reis, zodat de cron alleen actieve reizen leest (geen extra index nodig).
- `users/{uid}/plekken/{id}`: favoriete plekken (werk, oma, …).

## Beperkingen en nog te controleren

- **NS-treinsamenstelling:** de Virtual Train API is niet openbaar gedocumenteerd en kon hier niet live getest worden. Per bak leest de app eerste klas en stilte als de data dat bevat, en gebruikt anders de vaste indeling van het type (`src/lib/treinvariant.ts`). Splitsen herkent de app aan de eindbestemming per treinstel én aan de ritdata (takken, meerdere vertrekken, minder treinstellen). In het voertuiginfo-scherm staat *Ruwe NS-data* (met *Kopieer alles*): daarmee is de verwerking snel bij te stellen.
- **Voertuigengids:** de teksten in `src/lib/data/voertuigen.json` komen uit openbare bronnen (met bronnen op elke pagina). De foto haalt de browser zelf uit het Wikipedia-artikel, met maker en licentie van Wikimedia Commons.
- **Voertuignummer bus/tram:** staat niet in de open data van Transitous; de app zegt dat eerlijk.
- **Busprijzen** zijn schattingen (`src/lib/data/tarieven.json`); elk jaar in januari bijwerken.
- **Push op iOS** werkt alleen als de app op het beginscherm staat; de app legt dat uit bij de eerste login.
- **Gratis limieten:** locatie delen schrijft hooguit elke minuut; de cron leest alleen actieve reizen en blijft onder 45 verzoeken per run.
