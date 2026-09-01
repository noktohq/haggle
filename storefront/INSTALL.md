# Installing Haggle on a Shopify theme

Tested on the "glidex" theme on a Shopify Plus development store; works with any
Online Store 2.0 theme.

## 1. Upload the script

Shopify admin → **Online Store → Themes → ⋯ → Edit code** → under **Assets**,
click *Add a new asset* → upload `webmcp-haggle.js`.

## 2. Include it in the theme

Open **Layout → theme.liquid** and add this line right before `</body>`:

```liquid
<script src="{{ 'webmcp-haggle.js' | asset_url }}" data-api-url="https://YOUR-HAGGLE-SERVER" defer></script>
```

Replace `https://YOUR-HAGGLE-SERVER` with your deployed negotiation service
(e.g. the Cloud Run URL). Save.

## 3. Verify

Open any product page over HTTPS in Chrome with
`chrome://flags/#enable-webmcp-testing` enabled (or in ChatGPT's in-app
browser). The console should log `[haggle] WebMCP tools registered`, and the
agent will see the tools `list_negotiable_products`, `start_negotiation`,
`make_offer`, `get_negotiation_state` and `accept_deal`.

Regular visitors see no change — the small negotiation widget only appears once
an agent starts haggling.

## Uninstall

Remove the script tag from `theme.liquid`. Done.
