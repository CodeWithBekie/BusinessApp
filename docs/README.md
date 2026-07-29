# docs/

- `product-spec-v1.3.md` — the original product specification: vision, functional requirements,
  data model rationale, the phased roadmap (Phase 0 through Phase 3), and the architectural
  decisions (WhatsApp-first ordering, MCP tool exposure, RAG citations, etc.) that the rest of the
  codebase implements.

**Treat this as historical/directional, not a live status report.** The spec's own "Phase 0/1/2/3"
framing undersells how much is actually built today — RBAC (spec Phase 1), the full accounting
suite and AI Business Brain (spec Phase 2), and customer-facing order/payment management (not in
the original spec at all) are all real and working. For what's *actually* implemented right now,
read the top-level `README.md` and the per-folder `README.md` files under `server/` and `mobile/`
instead of inferring current state from this document's phase labels.

Still genuinely useful from this doc: the underlying business rationale (why WhatsApp-first, why
an aggregator instead of direct EcoCash merchant integration, why RAG citations matter, the target
market/business-model context) and Section 23's list of open decisions not yet resolved one way or
the other.
