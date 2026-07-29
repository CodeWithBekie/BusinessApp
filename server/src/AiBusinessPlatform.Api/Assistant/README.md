# Assistant/

Support types for the streaming AI "Business Brain" chat feature. The actual endpoint logic lives
in `../Endpoints/AssistantEndpoints.cs`, not here — this folder just holds two small pieces the
endpoint depends on.

## Files

- **`ElicitationRegistry.cs`** — a process-wide `ConcurrentDictionary` bridging an MCP server's
  mid-tool-call "I need more info from a human" request (raised while the chat SSE stream is still
  open) to the separate `POST /api/assistant/elicit/{id}` request the human's form answer arrives
  on. `Register()` creates a pending entry and a `TaskCompletionSource`; `AwaitAnswerAsync` blocks
  with a 3-minute timeout (auto-resolves to a cancel action on timeout); `TryResolve` checks the
  caller's `businessId` matches the pending entry's before completing it, so one tenant can never
  answer another tenant's pending elicitation.
- **`McpServerOptions.cs`** — just `BaseUrl` (default `http://localhost:5262`), where the endpoint
  finds the `Mcp` project to connect to as an MCP client.

## How the chat endpoint actually works (for context — code is in `Endpoints/AssistantEndpoints.cs`)

`POST /api/assistant/chat` opens a `text/event-stream` response and connects to `Mcp` as a real
MCP client, forwarding the caller's own bearer token — so every MCP tool call executes as that same
authenticated business. It also wires up **sampling** (the `Mcp` server can ask this same
`IChatClient` to draft text, e.g. for `draft_customer_message`) and **elicitation** (a tool can
pause mid-call and ask the human a structured question via `ElicitationRegistry`).

SSE frame shapes: `{"type":"token","text":...}` while streaming, `{"type":"elicitation_request",...}`
if a tool needs human input mid-stream, and exactly one terminal `{"type":"done","citations":[...],"toolsUsed":[...]}`
or `{"type":"error","message":...}`.

## Testing/debugging

Requires the `Mcp` project running (port 5262 by default) **and** LM Studio running locally —
without either, the endpoint emits an `error` frame almost immediately.

```bash
curl -N -X POST http://localhost:5151/api/assistant/chat \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"what are my top selling items?"}]}'
```

(`-N`/`--no-buffer` so curl streams the SSE output instead of waiting for the connection to close.)

To test elicitation end-to-end, watch the stream for an `elicitation_request` frame, then before
its 3-minute timeout: `POST /api/assistant/elicit/{elicitationId}` with
`{"action":"accept"|"decline"|"cancel","content":{...}}`.
