# Resources/

**`BusinessResources.cs`** — a single `[McpServerResourceType]` class exposing five read-only MCP
**resources**. Distinct from a *tool*: a resource is meant to be attached as context by an MCP
host's UI (e.g. the mobile Assistant's "Attach" picker, or the "Ask Assistant about this" buttons
on the Order/Purchase Order detail screens) rather than invoked by the model's own autonomous
tool-calling loop.

| URI template | Returns |
|---|---|
| `business://catalog` | active catalog items (JSON) |
| `business://sales-summary` | 30-day sales summary (JSON) |
| `business://suppliers` | supplier list (JSON) |
| `business://orders/{orderId}` | one order's full detail (JSON) |
| `business://purchase-orders/{purchaseOrderId}` | one purchase order's full detail (JSON) |

Each method reuses the exact same `Application.Tools` function its equivalent tool/REST endpoint
calls, then manually `JsonSerializer.Serialize`s the result — required because resource methods
must return an SDK-recognized type (`string`, `ResourceContents`, etc.), unlike tool methods, which
can return arbitrary records directly.

Adding a new resource: follow the existing methods' shape, and remember it's for *context
attachment*, not action — if you want the model to be able to call it as part of reasoning, add it
as a tool in `../Tools/` instead (or as well).
