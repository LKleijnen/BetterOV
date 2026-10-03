# BetterOV — werkafspraken voor Claude

Advertentievrije OV-webapp (PWA) voor een kleine kring (±20 mensen, alleen op uitnodiging). Kern: de app **bewaakt je reis** en biedt alternatieven als het misgaat. Live op https://betterov.kleijnen-lars.workers.dev. Functie-overzicht en installatiestappen: `README.md`.

## Taal en toon
- Alle UI-teksten, code-identifiers, commentaar en commits in het **Nederlands** (bestaande stijl volgen: `vertrek`, `aankomst`, `leg`, `advies`, `halte`).
- Communiceer met de gebruiker (Lars) in het Nederlands, kort en praktisch. Hij is geen developer: geef exacte klikstappen als hij iets moet doen.

## Harde randvoorwaarden
- **€0**: alleen gratis tiers, geen creditcard. Firebase blijft op Spark (dus géén Cloud Functions). Cloudflare Workers Free: max ±50 subrequests per aanroep (cron houdt 45 aan).
- **Open source**: de repo moet publiek blijven (eis van Transitous). Geen geheimen in de code.
- Transitous vraagt een User-Agent met contact (`USER_AGENT` in `src/lib/server/motis.ts`) en een zichtbare bronvermelding.
- Reisopties (`src/lib/reisopties.ts`): naar MOTIS als `additionalTransferTime`/`transitModes`/`pedestrianProfile`; naar NS als `addChangeTime`, `excludeTrainsWithReservationRequired`, `disabledTransportModalities`, `searchForAccessibleTrip` (niet officieel bevestigd; bij HTTP 400 opnieuw zonder). `pastBij` filtert de uitkomst altijd nog zelf.
- NS Reisinformatie API: 300 verzoeken per 5 minuten → altijd cachen (`gecached`/`gedeeldGecached` in `src/lib/server/http.ts`).

## Architectuur
- **SvelteKit 2 + Svelte 5 (runes)** als Cloudflare Worker (`@sveltejs/adapter-cloudflare`, `wrangler.jsonc`). `ssr = false`: de server levert de schil + `/api/*`.
- **Cron-worker** in `cron/` (elke minuut): controleert actieve reizen, stuurt FCM-push, waarschuwt voor de laatste trein naar huis (`laatsteTreinWekkers`, logica in `src/lib/wekker.ts`), rondt reizen af, ruimt gedeelde reizen op. Importeert alleen gedeelde modules met **relatieve imports** (geen `$lib`, geen `$env`).
- **Firebase**: Auth (Google) + Firestore + FCM. Server praat met Firestore/FCM via REST met een service account (`src/lib/server/firestore.ts`, `google.ts`, `fcm.ts`) — géén Admin SDK.
- Gedeelde logica (client, server én cron): `src/lib/types.ts`, `reis.ts` (overstappen, problemen, huidige stap), `tijd.ts` (altijd Europe/Amsterdam), `geo.ts`.
- Server: `src/lib/server/` — `motis.ts` (Transitous v6, fallback v5), `ns.ts` (defensief parsen: NS-velden kunnen ontbreken), `planner.ts` (4 s timeout → NS-fallback), `reisstatus.ts`, `trein.ts`, `prijs.ts` + `src/lib/data/tarieven.json`.
- Client: `src/lib/client/` — `sessie.svelte.ts` (login/allowlist), `data.svelte.ts` (Firestore of lokaal in demo-modus), `planner.svelte.ts`, `actief.svelte.ts` (actieve reis, 30 s verversen), `api.ts` (`metCache` voor slecht bereik).
- Toegang: `ADMIN_EMAILS` (secret) + Firestore-collectie `allowlist`. Uitnodigingslinks (`src/lib/server/uitnodiging.ts`, collectie `uitnodigingen`, alleen een SHA-256 van de code) zetten iemand na inloggen op de allowlist; eenmalig dankzij een voorwaarde op `updateTime`. Gmail-adressen worden genormaliseerd (puntjes/`+label` tellen niet) via `normaliseerEmail` in `src/lib/server/auth.ts`.
- Firestore-regels: `firestore.rules` (handmatig in de Firebase-console geplakt — wijzigingen daar melden aan de gebruiker).

## Svelte 5-valkuil
`$effect` dat een async functie aanroept die zelf `$state` leest/schrijft → oneindige lus. Roep zulke functies aan binnen `untrack(() => …)` en lees alleen de echte afhankelijkheden daarbuiten (zie `vertrektijden/+page.svelte`, `+layout.svelte`).

## Ontwikkelen en testen
- `npm install` (lokaal met npm 10 kan `npx -y npm@11 install` nodig zijn door een npm-bug).
- `npm run dev:mock` — app met **nepdata** (`MOCK_API=1`, `src/lib/server/mock.ts`). In de cloudomgeving zijn `api.transitous.org` en `gateway.apiportal.ns.nl` geblokkeerd, dus test daar altijd zo.
- Zonder Firebase-config draait de app in **demo-modus** (geen login, data in localStorage). Online alleen met `DEMO_MODUS=1`.
- Controle vóór elke push: `npm run check` (typecheck app + cron), `npm test` (vitest, `src/**/*.test.ts`), `npm run build`.
- E2E: `npm run test:e2e` (Playwright, nepdata). In de cloudomgeving: `PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run test:e2e`.
- `worker-configuration.d.ts` wordt gegenereerd (`npm run gen`) en staat **niet** in git.

## Werkwijze en uitrol
- Werk op een branch, open een PR naar `main`. De workflow `.github/workflows/uitrollen.yml` test elke PR; na merge naar `main` rolt hij app én cron-worker uit naar Cloudflare en zet de secrets.
- Secrets (GitHub → Actions → Repository secrets): `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `NS_API_KEY`, `FIREBASE_SERVICE_ACCOUNT`, `ADMIN_EMAILS`. Variables: `PUBLIC_FIREBASE_*`.
- Een gewijzigd GitHub-secret komt pas in Cloudflare na een nieuwe run van de workflow (*Actions → Testen en uitrollen → Run workflow*).

## Bekende open punten
- **NS Virtual Train API** (instapadvies per bak, kortere trein, treinposities) is niet openbaar gedocumenteerd en nog niet met echte data getest. Parser: `nsSamenstelling` in `ns.ts`; de UI heeft "Ruwe NS-data" om het echte formaat te bekijken.
- **NS SpoorKaart** (`nsSpoorkaart` in `ns.ts`, pad `/Spoorkaart-API/api/v1/spoorkaart`) is nog niet met echte data getest; de app leest elke GeoJSON-lijn en valt zonder spoorkaart terug op de lijn van de planner (`src/lib/spoor.ts`).
- MapLibre v6 zoekt zijn worker naast het eigen script; na bundelen klopt dat niet, dus `Kaart.svelte` zet `setWorkerUrl` (import met `?worker&url`, `worker.format: 'es'` in `vite.config.ts`).
- Voertuiginfo: afbeeldingen per bak (`bakAfbeeldingen`), drukte per bak en `eindbestemming` per treinstel komen uit de Virtual Train API (niet getest met echte data). Splitsen: `bepaalSplitsing` in `trein.ts` via het aantal treinstellen per halte in de NS-ritdata. Treinweergave: `TreinSchema.svelte` (liggend, overzicht met haakjes per bestemming + scrollbare strook). Treintypes ("Over deze trein"): vaste, openbaar bekende gegevens per type in `src/lib/materieel.ts` (NS, regionale vervoerders, internationaal); herkend aan het NS-type of anders de productnaam van de planner. Voor bus/tram/metro bestaat geen type-informatie in de open data.
- Voertuignummer van bus/tram zit niet in de open data van Transitous.
- Busprijzen zijn schattingen: `tarieven.json` elk jaar in januari bijwerken.
- Stationspagina (`/station?code=…` of `?naam=…&lat=…&lon=…`, `/api/station`): sporen en soort uit de NS-stations (v2, cache `ns-stations-v3`), voorzieningen uit de NS Places API (`nsVoorzieningen`, `/places-api/v2/places?station=…`, defensief geparsed; nog niet met echte data getest). De plattegrond is voorlopig de kaart ingezoomd op het station met de voorzieningen als puntjes; Lars levert later info over een plattegrond-API.
- Ideeën voor later (zitten al in het NS-product "Ns-App"): Disruptions API (werkzaamheden op vaste reizen), echte stationsplattegrond met looproute bij overstappen.
