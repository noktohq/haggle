# Haggle — din AI pruter med vår AI

[![CI](https://github.com/noktohq/haggle/actions/workflows/ci.yml/badge.svg)](https://github.com/noktohq/haggle/actions/workflows/ci.yml)

*Norsk utgave — [English version](README.md) (primær).*

**Den første sykkelbutikken der agenten din forhandler prisen.** Haggle legger
[WebMCP](https://github.com/webmachinelearning/webmcp)-verktøy på en ekte
Shopify-butikk, slik at kundens agent (ChatGPT-nettleseren, eller Chrome med
WebMCP aktivert) kan forhandle med butikkens serverside-AI-selger — og avtalen
blir en ekte engangs Shopify-rabattkode som mennesket løser inn i den vanlige
kassen.

Bygget for [WebMCP Challenge](https://webmcp.devpost.com/) på
[Bikepoint](https://bikepoint-no.myshopify.com), en Shopify-utviklingsbutikk
med en ekte elsykkelkatalog. Av [Nokto](https://nokto.no).

![Live-forhandling på Bikepoint](docs/images/live-deal.png)

*En ekte forhandling på live-butikken: kjøperens agent prutet selgeren ned fra
18 999 kr til 18 000 kr — widgeten (nede til høyre) viser avtalen og den ekte
engangsrabattkoden mennesket bruker i den vanlige kassen.*

**Prøv selv:** åpne [bikepoint-no.myshopify.com](https://bikepoint-no.myshopify.com)
(butikkpassord `haggle`) i ChatGPT-nettleseren, gå til en produktside og be
agenten din skaffe deg en bedre pris. (Chromes
`chrome://flags/#enable-webmcp-testing` eksponerer WebMCP-flaten slik at
verktøyene registreres, men vanlig Chrome har ingen agent som driver dem —
kombiner flagget med en WebMCP-drivende agent/utvidelse, eller bruk
ChatGPT-nettleseren for hele løpet.)

## Hvorfor dette trengte WebMCP

Prisforhandling på nett har aldri eksistert i skala, fordi det krevde et
menneske i begge ender. WebMCP fjerner nøyaktig den begrensningen: butikken
eksponerer en *forhandlingsprotokoll* som verktøy — ikke bare CRUD — og
nettleserens agent representerer kjøperen, mens mennesket beholder det siste
håndtrykket.

```
Menneske ──> Agent (ChatGPT-nettleser / Chrome)     Butikk (Shopify-tema)
              │  WebMCP: document.modelContext         │  webmcp-haggle.js
              │  list_negotiable_products              │
              │  start_negotiation ─────────────────>  │──> Haggle-server (Cloud Run)
              │  make_offer  <── mottilbud ──────────  │      • hemmelig prisgulv
              │  accept_deal ────────────────────────> │      • Claude formulerer selgeren
              │                                        │      • Shopify Admin API utsteder
              └──> mennesket bruker rabattkoden i ekte kasse    en engangsrabattkode
```

## Verktøyene agenter ser

| Verktøy | Hva det gjør |
|---|---|
| `list_negotiable_products` | Katalog med handles og listepriser i NOK |
| `start_negotiation` | Åpner en økt med AI-selgeren for ett produkt |
| `make_offer` | Byr i NOK; selgeren godtar, avviser eller gir mottilbud (maks 6 runder) |
| `get_negotiation_state` | Gjeldende bud, runder, status |
| `accept_deal` | Låser avtalen → returnerer en ekte engangsrabattkode |

Sikkerhet ved struktur: prisgulvet (`MAX_DISCOUNT_PCT`, standard 10 %)
håndheves på serversiden og forlater den aldri. Den valgfrie Claude-«stemmen»
formulerer bare meldinger — hvert tall den kan ytre er beregnet og klemt
deterministisk først, og svar som ikke siterer den autoritative prisen
forkastes. Ingen nøkkel? En deterministisk norsk malstemme tar over.

## Repo-struktur

```
server/       null-avhengighets forhandlingstjeneste på Node 20 (+ Dockerfile)
storefront/   webmcp-haggle.js tema-snutt · INSTALL.md · frittstående demo.html
e2e/          Playwright-suite som driver WebMCP-verktøyene slik en agent ville
scripts/      smoke.sh — svartboks HTTP-forhandling, samme skript som CI kjører
docs/         WebMCP-API-notater med kilder
```

## Reproduserbar testing (ingen kontoer nødvendig)

```bash
cd server
npm test                                   # testsuite for forhandlingsmotoren
npm ci && npm run typecheck                # streng tsc over den JSDoc-typede kildekoden
MOCK_PRODUCTS=1 node src/index.js          # kjører på :8080 med fixturkatalog
```

Forhandle deretter over HTTP:

```bash
curl -s -X POST localhost:8080/api/session -H 'Content-Type: application/json' \
     -d '{"productHandle":"demo-ecoride-tripper"}'
curl -s -X POST localhost:8080/api/offer -H 'Content-Type: application/json' \
     -d '{"sessionId":"<id>","offerNOK":30000}'
curl -s -X POST localhost:8080/api/accept -H 'Content-Type: application/json' \
     -d '{"sessionId":"<id>"}'
```

Eller la maskinene gjøre det: `bash scripts/smoke.sh` kjører nøyaktig det
løpet, og `cd e2e && npm ci && npx playwright test` spiller kjøperens agent i
Chromium mot det ekte storefront-scriptet — de samme sjekkene CI kjører på
hver push til main og hver PR.

Eller server `storefront/` statisk (f.eks. `npx http-server storefront`) og
åpne `demo.html` i en WebMCP-aktivert nettleser mens mock-serveren kjører —
serveren godtar localhost-origins rett ut av boksen, og `?api=<url>` peker
siden mot en hvilken som helst annen server.

## Produksjonsoppsett

1. Deploy serveren: `gcloud run deploy haggle --source server --region europe-north1 --allow-unauthenticated`
2. Sett miljøvariabler (se `.env.example`): `SHOPIFY_STORE_DOMAIN`,
   `SHOPIFY_ADMIN_TOKEN` (egendefinert app med `read_products` +
   `write_discounts`), `MAX_DISCOUNT_PCT`, valgfri `ANTHROPIC_API_KEY`.
3. Installer tema-snutten: se `storefront/INSTALL.md`.

Merk: på Cloud Runs `*.run.app`-domene fanges `GET /healthz` av Googles
frontend før den når containeren (du får Googles HTML-404). Bruk
`POST /api/session` som helsesjekk i produksjon; `/healthz` virker lokalt og
i CI.

## Ingeniørnotater

- **Null-avhengighets runtime.** `server/` kjører på ren Node 20 —
  `node src/index.js` er hele deployen. `typescript` og `@types/node` er kun
  dev-avhengigheter, for sjekking.
- **Typet uten byggesteg.** Serverkildekoden er JSDoc-annotert JS under
  `// @ts-check`; `npm run typecheck` kjører `tsc --checkJs --noEmit` i streng
  modus.
- **WebMCP-flaten er e2e-testet.** Playwright laster den ekte `demo.html`,
  shimmer `document.modelContext` slik en agent-runtime ville, fanger de
  registrerte verktøyene og spiller kjøperens agent gjennom en full
  forhandling (`e2e/`).
- **Prisgulv ved struktur, ikke prompt.** Gulvet finnes bare inne i den
  deterministiske motoren. Enhetstester hamrer på det (aldri brutt, aldri
  lekket), og både smoke-skriptet og e2e-suiten verifiserer grensene på nytt
  over nettet.

## Lisens

MIT © Nokto
