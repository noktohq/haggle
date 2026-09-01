# WebMCP API notes (verified against the spec, September 2026)

Sources:
- https://github.com/webmachinelearning/webmcp (README/explainer, cloned and read directly)
- https://webmcp.devpost.com/ (challenge requirements)
- Community references noting the Navigator → Document move in the May 27 2026 draft
  and the deprecation of `navigator.modelContext` in Chromium 150.

Key facts this project builds on:

1. **Registration surface:** `document.modelContext.registerTool(toolDef, {signal})`
   (Promise-returning). Older Chromium exposes `navigator.modelContext`; the
   storefront script feature-detects both: `document.modelContext || navigator.modelContext`.
2. **Tool definition:** `{ name, description, inputSchema (JSON Schema), async execute(args) }`.
3. **Execute return shape:** MCP-style content array —
   `{ content: [{ type: "text", text: "..." }] }` (canonical example in the explainer).
   We JSON-encode structured payloads into the text part for agent parsing.
4. **Unregistration:** abort the `AbortSignal` passed at registration.
5. **Constraints:** secure context (HTTPS) only; top-level browsing context
   (iframes need Permissions Policy `allow="tools"`).
6. **Testing:** Chrome flag `chrome://flags/#enable-webmcp-testing`
   (`navigator.modelContextTesting.getTools()/executeTool()` in DevTools), or
   ChatGPT's in-app browser as an end-to-end agent.
