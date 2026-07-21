# AI Business Automation Platform
## Complete Project Documentation

**Status:** Production-track specification (v1.3)
**Scope:** End-to-end — vision through deployment
**Change log:**
- v1.1 — Adopted .NET / ASP.NET Core as the implementation stack; added AI integration architecture (chatbot hosting, C# function calling, human approval, RAG, MCP server)
- v1.2 — Added Microsoft.Extensions.AI as the provider-abstraction layer; added response streaming for dashboard-based AI surfaces; added source citation to the RAG system; clarified the MCP server as the mechanism letting external AI clients (e.g. ChatGPT, Claude) act on the platform through natural language
- v1.3 — Expanded target market to include both SME and large enterprise customers; added dedicated-tenancy option, multi-branch enterprise account modeling, SSO/SAML, and enterprise pricing/sales considerations

---

## Table of contents

1. Executive summary
2. Vision & goals
3. Target market
4. Product scope & roadmap
5. Stakeholders & roles
6. Functional requirements
7. Non-functional requirements
8. Use cases
9. System architecture
10. AI integration architecture (.NET implementation)
11. Data model
12. API design
13. Third-party integrations
14. Multi-tenancy & data isolation
15. Security & compliance
16. Infrastructure & deployment
17. Technology stack
18. Testing strategy
19. Business onboarding flow
20. Business model (recommendation)
21. Risks & mitigations
22. Milestones & timeline
23. Open decisions requiring sign-off
24. Glossary

---

## 1. Executive summary

The platform automates the order-to-cash cycle for any small or medium business, starting inside WhatsApp — the channel where most of this commerce already happens informally. A customer messages the business, an AI agent understands the request, checks the business's catalog, generates a quote and invoice, collects payment through mobile money, and updates records automatically. The same core is designed to extend, in later phases, into accounting, procurement, and a natural-language automation builder that lets an owner describe a workflow in plain English and have the platform build it.

This document specifies the product end-to-end: requirements, architecture, data model, integrations, security, infrastructure, and rollout plan, so that it can move from idea to a built, deployed, multi-tenant product, implemented on .NET.

---

## 2. Vision & goals

**Vision:** "Automate your entire business from WhatsApp" — an AI employee that never sleeps, usable by any company in any industry.

**Product goals:**
- Remove manual, repetitive order-handling work for SME owners
- Work inside a channel customers already use (WhatsApp) rather than requiring a new app
- Be industry-agnostic at the data-model level from day one, even though initial go-to-market targets one segment
- Be built so new capabilities (accounting, procurement, automation builder) are additive, not rewrites
- Avoid locking the product to a single AI provider — the platform should be able to switch model providers without a rewrite

**Non-goals for v1:**
- Replacing full accounting/ERP systems
- Supporting every payment method or every industry on day one
- Building a generic no-code workflow engine before one workflow works end-to-end

---

## 3. Target market

The platform targets **both small businesses and large enterprises**, not one segment exclusively. These two segments buy differently and need different guarantees, so the product and architecture are built to serve both without forking into two separate products.

**Small/medium businesses (SME):**
- Hardware stores, grocers, salons, consultants, single-branch operations
- Self-service onboarding (Section 19), shared infrastructure, standard subscription pricing
- Fastest path to value: sign up, connect WhatsApp, go live in days

**Large enterprises:**
- Multi-branch retailers, national distributors, chains with dedicated IT/procurement functions
- Need: single sign-on (SSO/SAML) for staff access, custom SLAs and support contracts, higher WhatsApp message throughput (Section 13.1 — capacity upgrades beyond the 80 msg/sec default), stronger audit/compliance guarantees (Section 15), and in some cases a dedicated (non-shared) deployment rather than the standard shared-tenant model (Section 14)
- Sales-assisted onboarding rather than pure self-service, with a named account manager

**Sequencing:** the MVP pilot (Section 4, Phase 0) targets small stock-based businesses first, because that's the fastest way to prove the core order-to-cash flow end-to-end. Enterprise-specific requirements (SSO, dedicated tenancy, custom SLAs) are captured now as architectural requirements (Sections 14, 15, 17) so the platform doesn't need to be re-architected later to serve a large customer — but enterprise go-to-market itself follows the SME pilot, once the core product is proven.

**Any industry, either segment:** the industry-agnostic catalog model (stock/time-based/quote-based items) applies equally to a single-location small shop and a multi-branch enterprise chain.

**Geography:** Initial rollout assumed to be Zimbabwe (given EcoCash/OneMoney as primary payment rails), with an architecture that does not hardcode this — payment and messaging providers are pluggable per region. Enterprise customers may require multi-country/multi-branch support from day one, which the multi-tenant, per-business WhatsApp connection model (Section 13.1) already accommodates by treating each branch as its own connected number under one parent account (Section 14).

---

## 4. Product scope & roadmap

### Phase 0 — MVP: WhatsApp order-to-cash

- Customer WhatsApp ordering
- AI message parsing against a stock-based catalog
- Automated quote → invoice → payment link → payment confirmation → stock decrement → receipt
- Manual delivery coordination (no automation)
- Single catalog type: stock-tracked items
- Web dashboard for the owner: catalog management, order list, basic sales view

### Phase 1 — Service businesses & delivery automation

- Time-based catalog items (appointments/bookings)
- Delivery MCP automation (driver assignment, tracking)
- Multi-user accounts per business (owner + staff roles)

### Phase 2 — Financial intelligence

- Automated bookkeeping (journal entries per sale, cash flow view)
- AI Business Brain: a conversational, streaming dashboard assistant (Section 10.2) backed by the RAG system (Section 10.6), answering with source citations

### Phase 3 — Automation builder & marketplace

- Natural-language automation builder (plain-English workflow creation)
- Supplier/procurement marketplace
- Payroll, HR, CRM modules

**Explicitly out of scope until proven demand exists:** fraud detection, voice assistant, white-labeling, public business directory.

---

## 5. Stakeholders & roles

| Role | Responsibility |
|---|---|
| Product owner | Defines priorities, approves scope changes |
| .NET backend engineers | ASP.NET Core services, EF Core data layer, MCP server implementation |
| Frontend engineer | Owner dashboard |
| AI/ML engineer | Orchestrator/function design, prompt and provider configuration, parsing accuracy, evaluation, RAG pipeline |
| DevOps/infrastructure | Deployment, monitoring, backups, scaling |
| Integrations engineer | WhatsApp Cloud API, payment gateway, delivery partners |
| QA | Test plans, UAT coordination |
| Business/pilot lead | Recruits and supports pilot businesses, gathers feedback |
| Enterprise sales/account manager | Manages sales-assisted onboarding, contracts, and SLAs for large customers (Section 3) |

---

## 6. Functional requirements

### 6.1 Business onboarding
- FR1: A business can sign up and create a workspace (tenant).
- FR2: A business can configure its catalog (items, prices, stock levels or time slots).
- FR3: A business can connect its own WhatsApp Business number via the Cloud API onboarding flow.
- FR4: A business can connect a payment method for receiving customer payments.
- FR5: A business can upload internal documents (policies, FAQs, product info) for the RAG-backed assistant to use (Section 10.6).

### 6.2 Customer ordering (WhatsApp)
- FR6: A customer message is received via webhook and associated with the correct business (tenant).
- FR7: The AI orchestrator parses the message into a structured order intent (item, quantity, customer detail).
- FR8: The system checks catalog availability (stock quantity or time slot) before quoting.
- FR9: The system replies with a quote in the customer's message thread.
- FR10: On confirmation, the system generates an invoice and a payment request.
- FR11: On payment confirmation (via webhook from the payment provider), the system updates stock/slot, generates a receipt, and notifies the business.
- FR12: If an item is unavailable, the system informs the customer and, if configured, notifies the owner to restock.
- FR13: If a message is ambiguous, the system asks a clarifying question rather than guessing.
- FR14: If a customer asks a policy/FAQ question (returns, hours, delivery areas), the system answers using the business's own documents via RAG (Section 10.6), citing the source document.

### 6.3 Business owner dashboard
- FR15: Owner can view, add, edit, and deactivate catalog items.
- FR16: Owner can view a list of orders with status (quoted, invoiced, paid, fulfilled, cancelled).
- FR17: Owner can view a basic sales summary (daily/weekly totals).
- FR18: Owner can manually mark an order as delivered.
- FR19 (Phase 1): Owner can invite staff with role-based access (admin, cashier/fulfillment).
- FR20: Owner can review and approve/reject pending sensitive-action requests raised by the AI (Section 10.5).
- FR21 (Phase 2): Owner can chat with a streaming AI Business Brain assistant in the dashboard and see cited sources for its answers (Section 10.2, 10.6).

### 6.4 Payments
- FR22: The system generates a payment request through the connected mobile money provider.
- FR23: The system receives and verifies payment confirmation callbacks.
- FR24: The system reconciles payments against invoices and flags mismatches for manual review.

### 6.5 Platform administration
- FR25: Platform admins can view all tenants, their status, and usage (for support and billing).
- FR26: Platform admins can suspend a tenant's access (e.g. for non-payment or abuse).

---

## 7. Non-functional requirements

| Category | Requirement |
|---|---|
| Availability | Target 99.5% uptime for the MVP; core message-handling path should degrade gracefully (queue messages) rather than drop them during downstream outages |
| Performance | AI parse-and-quote response within WhatsApp's expected conversational latency (target under 5 seconds end-to-end for a straightforward order); dashboard chat surfaces should begin streaming a response within ~1 second |
| Scalability | Must support onboarding new tenants without code changes; database and function/MCP layer must scale horizontally as tenant count grows |
| Data isolation | No tenant may access or infer another tenant's data under any circumstance; enforced at the EF Core data-access layer, not just the application layer |
| Security | All data encrypted in transit (TLS) and at rest; secrets (API tokens, payment credentials) stored in a secrets manager, never in source code or plain config |
| Auditability | Every order, payment, stock change, and AI-initiated sensitive action is logged with actor, timestamp, and before/after state |
| Localization | Currency and language configurable per tenant; system must support at least USD and local currency display |
| Compliance | Must comply with applicable data protection law in the country of operation (see Section 15) |
| Recoverability | Daily automated backups, with a tested restore procedure; target recovery point objective (RPO) of 24 hours, recovery time objective (RTO) of 4 hours for MVP |
| AI safety | The AI orchestrator must never execute a sensitive action (Section 10.5) without explicit human approval, regardless of how confident its own assessment is |
| Provider flexibility | The AI integration layer must allow switching model providers (e.g. Anthropic, OpenAI, Google) through configuration, not a rewrite (Section 10.1) |

---

## 8. Use cases

### UC1 — Place and pay for an order via WhatsApp
**Actor:** Customer
**Preconditions:** Business onboarded, catalog configured, WhatsApp number connected.
**Main flow:**
1. Customer sends a WhatsApp message describing a request.
2. Orchestrator parses the message against the business's catalog.
3. System checks availability.
4. System replies with a quote.
5. Customer confirms.
6. System generates invoice and payment link.
7. Customer pays.
8. System confirms payment, updates catalog, sends receipt, notifies business.

**Alternate flows:** out-of-stock notice; payment failure/retry; clarifying question for ambiguous input; policy/FAQ question answered via RAG with a cited source.
**Postconditions:** Order recorded; catalog updated; payment reconciled; receipt delivered.

### UC2 — Manage catalog and view sales
**Actor:** Business owner
**Main flow:** Owner logs into the dashboard, adds/edits catalog items, reviews order list and sales summary.

### UC3 — Onboard a new business
**Actor:** Business owner (new)
**Main flow:** Owner signs up, creates workspace, configures catalog, connects WhatsApp number through Meta's Cloud API flow, connects a payment method, uploads internal documents for RAG, and goes live.

### UC4 — Platform support intervention
**Actor:** Platform admin
**Main flow:** Admin reviews a flagged payment mismatch or a tenant support request and takes corrective action (manual reconciliation, resending a webhook, suspending an account).

### UC5 — AI requests approval for a sensitive action
**Actor:** AI orchestrator, business owner
**Main flow:**
1. During order handling, the AI determines an action requires approval (e.g. a refund above a configured threshold, cancelling a paid order, sending an email on the business's behalf).
2. AI creates a pending-approval record instead of executing the action.
3. Owner is notified (dashboard and/or WhatsApp).
4. Owner approves or rejects.
5. On approval, the AI executes the action and logs the outcome; on rejection, the AI informs the customer appropriately.

### UC6 — Owner asks the AI Business Brain a question
**Actor:** Business owner
**Preconditions:** Phase 2 feature enabled; business has uploaded relevant documents/has transaction history.
**Main flow:**
1. Owner types a question in the dashboard chat (e.g. "why are profits dropping?").
2. The assistant streams its answer token by token as it's generated.
3. The answer includes citations back to the specific documents or data it drew from.
4. Owner can click a citation to see the underlying source.

### UC7 — External AI client performs an action via MCP
**Actor:** A third-party AI client (e.g. Claude, ChatGPT, or an internal tool) connected to the platform's MCP server
**Main flow:**
1. A user of that external AI client asks it, in natural language, to do something the platform exposes as an MCP tool (e.g. "check stock for cement at Joe's Hardware").
2. The external client calls the platform's MCP server with the appropriate tool and parameters.
3. The MCP server validates the caller's authorization and tenant scope, then executes the same underlying C# function the in-app orchestrator would use.
4. Result is returned to the external client, which presents it to its user.

---

## 9. System architecture

### 9.1 Component overview

```
WhatsApp Business API (Meta Cloud API)
  - Graph API: outbound (quotes, invoices, receipts)
  - Webhooks: inbound (customer messages, message status)
  - Per business: own WABA + phone number + system user access token
        │
        ▼
Core platform (ASP.NET Core)
  - Webhook ingress (Minimal API endpoint, validates signature, routes by business_id)
  - AI orchestrator — parses messages, plans actions, calls C# functions/MCP tools (Section 10)
  - Provider-abstracted AI client (Microsoft.Extensions.AI, Section 10.1)
  - Tenant data store (EF Core + PostgreSQL) — isolated per business_id
  - RAG service — retrieves relevant, citable document chunks per business (Section 10.6)
  - Owner dashboard API (ASP.NET Core Web API, with streaming endpoints) — serves the web dashboard
        │
        ▼
Tool layer (in-process C# functions and/or MCP server, Section 10)
  - Catalog tools   → stock, time slots, pricing, availability
  - Payments tools  → payment gateway (see Section 13)
  - Delivery tools  → drivers, tracking (manual in MVP)
  - Approval tools  → sensitive-action gating (Section 10.5)
        │
        ▼
External services and external AI clients
  - Payment gateway/provider(s)
  - Couriers (Phase 1+)
  - Third-party AI clients (e.g. Claude, ChatGPT) connecting via the platform's MCP server (Section 10.7)
  - Future third-party MCP servers (accounting software, CRM, etc.)
```

### 9.2 Message flow (sequence, happy path)

1. Customer → WhatsApp → Meta Cloud API → webhook → ASP.NET Core ingress endpoint
2. Ingress resolves the `business_id` from the destination phone number, enqueues the message
3. Orchestrator picks up the message, loads tenant context (catalog, conversation history, relevant RAG documents)
4. Orchestrator calls the Catalog tool to check availability and pricing
5. Orchestrator composes a quote, sends via Graph API back to the customer
6. On customer confirmation, orchestrator calls the Catalog tool to reserve stock, then the Payments tool to create a payment request
7. Payment provider sends a webhook on payment completion
8. Orchestrator confirms the order, finalizes the stock decrement, sends a receipt via Graph API, and writes an audit log entry
9. If, at any step, the planned action is flagged sensitive, the orchestrator instead raises an approval request (Section 10.5) and pauses that step until a human responds

### 9.3 Design principles

- **Idempotency:** every webhook handler (WhatsApp, payment provider) must be idempotent — duplicate webhook deliveries must not double-charge, double-decrement stock, or send duplicate messages.
- **Queue-backed processing:** inbound messages and payment webhooks go through a queue, not a direct synchronous handler, so a slow AI response or downstream outage doesn't drop messages.
- **Tool-scoped AI:** the orchestrator's available functions/tools are scoped to the order-to-cash flow only at MVP — it is not given open-ended access to arbitrary actions until accuracy is proven in production.
- **Tenant context is loaded, never inferred:** `business_id` is resolved once at ingress and passed explicitly through every downstream call — never re-derived from message content.
- **Provider-agnostic by design:** nothing in the orchestrator, tool layer, or RAG pipeline depends on a specific AI vendor's API shape (Section 10.1) — switching or A/B testing providers is a configuration change.

---

## 10. AI integration architecture (.NET implementation)

This section specifies how the AI orchestrator is actually built on .NET: abstracting the model provider, hosting the chatbot with streaming, letting the model call real C# code, connecting that code to data and external APIs, gating sensitive actions behind human approval, answering from internal documents via RAG with citations, and exposing the same capabilities as an MCP server that external AI clients can use.

### 10.1 AI provider abstraction (Microsoft.Extensions.AI)

- All AI calls go through **Microsoft.Extensions.AI**, the standard .NET abstraction (`IChatClient` and related interfaces) rather than calling any single provider's SDK directly.
- This means the platform can run on Anthropic, OpenAI, or Google models — or switch between them, or route different tasks to different providers (e.g. a smaller/cheaper model for simple parsing, a stronger model for the AI Business Brain) — through configuration, not a rewrite of the orchestrator or tool layer.
- Before wiring this into the full ASP.NET Core orchestrator, the recommended build sequence is to first validate the chosen provider(s) and prompt/tool design in a small console harness (a throwaway or internal console app hitting `IChatClient` directly). This gives the team a fast feedback loop for testing message parsing accuracy and function-calling behavior before investing in the full hosted-service wiring in 10.2 — a development practice, not a separate production component.
- Provider credentials (API keys) are stored in the secrets manager (Section 15), never in application config checked into source control.

### 10.2 Building the chatbot in ASP.NET Core, with streaming

- The orchestrator runs as a hosted service within the ASP.NET Core application, consuming messages from the queue described in Section 9.
- Each inbound message is handled through a conversation loop: load conversation state (EF Core) → call the AI model through `IChatClient` with the conversation history, tenant context, and available functions → execute any requested function calls → send the model's reply via the WhatsApp Graph API client.
- **Streaming** is used for any surface with a live UI the user is watching — primarily the Phase 2 dashboard "AI Business Brain" chat (Section 6.3, FR21) — so the response renders token by token instead of the user waiting for the full answer. WhatsApp itself does not support token-level streaming (messages are delivered as discrete units), so the WhatsApp-facing orchestrator uses the same underlying client without streaming, sending complete messages.
- Conversation state (message history, pending order draft, pending approvals) is persisted per `conversation_id` so the loop is stateless between invocations and can resume after a restart or scale-out event.
- The webhook ingress and the orchestrator are separate ASP.NET Core components (Minimal API endpoint for ingress, hosted background service for orchestration) connected via the queue, so a burst of incoming messages doesn't block webhook acknowledgement.

### 10.3 Enabling the AI to call C# functions (tool calling)

- Business logic is exposed to the AI model as a fixed set of typed C# functions (tools), not as free-form code execution. Each function has a name, a description, and a strongly typed parameter/result contract, e.g.:
  - `CheckAvailability(businessId, itemQuery)`
  - `ReserveStock(businessId, itemId, quantity)`
  - `CreateInvoice(businessId, orderId)`
  - `CreatePaymentRequest(businessId, orderId, amount, customerNumber)`
  - `RequestApproval(businessId, actionType, details)`
- Tool calling is implemented through Microsoft.Extensions.AI's function-calling support (Section 10.1), so the same C# function definitions work regardless of which underlying model provider is configured.
- The AI model is given the list of available functions and their schemas at the start of each turn; when it decides an action is needed, it returns a structured function-call request rather than free text, which the orchestrator validates and executes against the actual C# implementation.
- Function implementations live in a standard application service layer (not AI-specific code) so the same functions are usable from the dashboard API, background jobs, or tests — the AI is just another caller of well-defined application services.
- Every function call and its result is logged (Section 9.3, audit_log table) before the result is returned to the model, so the full reasoning-to-action trail is reconstructable.

### 10.4 Integrating AI with external databases and APIs

- Database access from C# functions goes through EF Core repositories scoped to `business_id` (Section 11), never directly from AI-facing code — the function layer is the only thing that talks to the database on the AI's behalf.
- External API calls (WhatsApp Graph API, payment gateway, delivery partner APIs) are wrapped in typed HttpClient-based service classes, each exposed to the AI only through the specific functions listed in 10.3 — the AI never receives raw API credentials or makes unmediated HTTP calls.
- Each external integration has its own resilience policy (timeout, retry with backoff, circuit breaker) at the HttpClient level, so a slow or failing third party degrades gracefully instead of blocking the conversation loop.

### 10.5 Human-in-the-loop approval for sensitive actions

- A configurable list of action types are marked sensitive per business, for example: refunds above a threshold amount, cancelling a paid order, overriding a catalog price, sending an email or message on the business's behalf outside the normal order flow, deleting a customer record.
- When the orchestrator's plan includes a sensitive action, it calls `RequestApproval` instead of the real action function. This creates a pending-approval record (status: pending) and stops that part of the plan.
- The business owner is notified through the dashboard and, optionally, a WhatsApp message, with the action details and a clear approve/reject choice.
- Approval or rejection is captured through a dashboard endpoint (`POST /api/approvals/{id}/decision`), authenticated as that business's owner/admin — never through the AI itself, and never inferred from conversational text.
- Only on explicit approval does the orchestrator proceed to call the real underlying function; on rejection, it informs the customer and logs the outcome. This is enforced in code (the approval-gated functions have no direct execution path that bypasses the approval record), not just as a prompt instruction to the model.

### 10.6 RAG system over internal documents, with source citations

- Each business can upload internal documents (return policy, FAQs, product specifications, opening hours, terms of service) during onboarding or later from the dashboard.
- Documents are chunked, embedded, and stored in a vector-capable store, scoped by `business_id` (e.g. PostgreSQL with a vector extension, keeping the same primary database rather than introducing a separate system for MVP).
- When a customer or owner asks a question that looks like a policy/FAQ question rather than an order, the orchestrator retrieves the most relevant chunks for that business and includes them as grounding context before the model answers — so answers come from the business's actual documents, not general knowledge or another tenant's data.
- **Source citation:** every RAG-grounded answer is returned along with references to the specific document(s) and chunk(s) it drew from (document title, and where applicable a section/page marker). On WhatsApp, this is surfaced as a short reference line (e.g. "Source: Return Policy"); on the dashboard, citations are clickable and open the underlying document/section, so an owner or customer can verify the answer rather than trust it blindly.
- Retrieval is always filtered by `business_id` at the query level, matching the isolation rule in Section 11 — a business's documents are never retrievable in another tenant's conversation.
- This same RAG-with-citations pipeline is the foundation for the Phase 2 "AI Business Brain" conversational analytics feature, extended later to also retrieve from the business's own transaction data with citations back to the underlying records.

### 10.7 Building and integrating an MCP server

- The Catalog, Payments, Delivery, and Approval capabilities described in 10.3 are implemented once as C# application services, then exposed two ways:
  1. **In-process, direct calls** from the ASP.NET Core orchestrator — the fast path used for the platform's own AI model during normal operation.
  2. **As an MCP server**, built with the official MCP C# SDK, publishing the same functions as MCP tools.
- The MCP server is what allows **external AI clients — such as Claude or ChatGPT, or an internal company tool — to interact directly with the platform through natural language** (Section 8, UC7): a user of one of those clients can ask it to check stock, look up an order, or trigger an allowed action, and the client calls the platform's MCP tools to do it, rather than the platform's own team needing to build a bespoke integration for every AI product that might want to connect.
- Building it this way means the "AI calls C# functions" pattern (10.3) and the "MCP tool server" pattern are the same underlying code with two entry points, not a duplicated implementation — avoiding drift between what the in-app orchestrator can do and what's exposed externally.
- The MCP server enforces the same `business_id` scoping, authentication, and sensitive-action approval gating as the in-process path — MCP is a transport/interface choice, not a bypass of the isolation or approval rules in Sections 10.5 and 11. An external AI client authenticates as a specific business (or a specifically scoped integration account) and can only see and act on that business's data.
- This also positions the platform to plug in third-party MCP servers later (Section 13.3) using the same client infrastructure the orchestrator already uses to call its own tools.

---

## 11. Data model

Relational database (PostgreSQL, see Section 17), every table scoped by `business_id` except platform-level tables. Accessed through EF Core with repositories that enforce tenant scoping (Section 10.4).

### Core tables

**businesses**
`id, name, industry_type, currency, timezone, status (active/suspended), created_at`

**business_users**
`id, business_id, name, email, role (owner/admin/staff), created_at`

**catalog_items**
`id, business_id, name, item_type (stock/time_based/quote), price, currency, stock_quantity (nullable), unit, active, created_at, updated_at`

**time_slots** (for item_type = time_based)
`id, catalog_item_id, start_time, end_time, status (available/reserved/booked)`

**customers**
`id, business_id, whatsapp_number, name (nullable), created_at`

**conversations**
`id, business_id, customer_id, whatsapp_thread_id, status (open/closed), created_at`

**messages**
`id, conversation_id, direction (inbound/outbound), content, whatsapp_message_id, created_at`

**orders**
`id, business_id, customer_id, status (quoted/invoiced/paid/fulfilled/cancelled), total_amount, currency, created_at, updated_at`

**order_items**
`id, order_id, catalog_item_id, quantity, unit_price, subtotal`

**payments**
`id, order_id, provider (ecocash/onemoney/other), provider_reference, amount, status (pending/confirmed/failed), created_at, confirmed_at`

**deliveries**
`id, order_id, status (pending/assigned/in_transit/delivered), driver_name (nullable), notes, created_at, updated_at`

**pending_approvals** (Section 10.5)
`id, business_id, action_type, details (json), status (pending/approved/rejected), requested_at, decided_at, decided_by`

**documents** (Section 10.6)
`id, business_id, title, source_type, uploaded_at`

**document_chunks**
`id, document_id, business_id, content, embedding (vector), chunk_index, section_label (nullable, for citation display)`

**audit_log**
`id, business_id, actor_type (system/user), actor_id, action, entity_type, entity_id, before_state (json), after_state (json), created_at`

**whatsapp_connections**
`id, business_id, waba_id, phone_number_id, system_user_token (encrypted), status, created_at`

**mcp_integration_accounts** (Section 10.7)
`id, business_id, client_name, scoped_permissions (json), api_credential (encrypted), status, created_at`

### Isolation rule

Every query against a tenant-scoped table must include `business_id` in the `WHERE` clause. This is enforced through EF Core global query filters at the `DbContext` level, so it applies automatically rather than being left to individual query authors, and covered by an automated test that attempts cross-tenant reads and asserts they return nothing. This same enforcement applies whether the call originates from the in-app orchestrator or from an external client through the MCP server.

---

## 12. API design

### 12.1 Inbound: WhatsApp webhook

`POST /webhooks/whatsapp` (ASP.NET Core Minimal API endpoint)
- Verifies Meta's webhook signature
- Extracts `phone_number_id` to resolve `business_id`
- Enqueues the message for orchestrator processing
- Returns `200 OK` immediately (per Meta's webhook requirements) — processing happens asynchronously

### 12.2 Inbound: payment provider webhook

`POST /webhooks/payments/{provider}`
- Verifies provider signature/credentials
- Resolves `order_id` from the provider reference
- Enqueues a payment-confirmation event (idempotent on `provider_reference`)

### 12.3 Owner dashboard REST API (internal, authenticated)

- `GET /api/catalog` / `POST /api/catalog` / `PATCH /api/catalog/{id}`
- `GET /api/orders` / `GET /api/orders/{id}`
- `GET /api/sales/summary?range=`
- `POST /api/deliveries/{order_id}/mark-delivered`
- `POST /api/whatsapp/connect` (initiates Meta's Cloud API onboarding flow)
- `POST /api/payments/connect` (initiates payment provider onboarding)
- `GET /api/approvals` / `POST /api/approvals/{id}/decision` (Section 10.5)
- `POST /api/documents` (upload internal documents for RAG, Section 10.6)
- `POST /api/assistant/chat` — **streaming** endpoint (Server-Sent Events or equivalent) backing the dashboard AI Business Brain chat, returning incremental tokens plus a final citation list (Section 10.2, 10.6)

All dashboard endpoints require an authenticated session scoped to a single `business_id`; no endpoint accepts a caller-supplied `business_id` — it is always derived from the authenticated session.

### 12.4 C# functions / MCP tool schemas (called by the orchestrator or an external MCP client, Sections 10.3 and 10.7)

**Catalog**
- `CheckAvailability(businessId, itemQuery)` → matched items with price/stock
- `ReserveStock(businessId, itemId, quantity)` → reservation id
- `FinalizeStock(reservationId)` / `ReleaseStock(reservationId)`

**Payments**
- `CreatePaymentRequest(businessId, orderId, amount, currency, customerNumber)` → payment reference
- `GetPaymentStatus(paymentReference)` → status

**Delivery** (Phase 1)
- `AssignDriver(businessId, orderId)` → driver assignment
- `GetDeliveryStatus(orderId)` → status

**Approval** (Section 10.5)
- `RequestApproval(businessId, actionType, details)` → pending-approval id
- `GetApprovalStatus(approvalId)` → status

**RAG** (Section 10.6)
- `RetrieveRelevantDocuments(businessId, query)` → ranked document chunks with citation metadata

---

## 13. Third-party integrations

### 13.1 WhatsApp Business Platform (Meta Cloud API)

- Sending via Graph API; receiving via Webhooks, both over HTTPS/TLS
- Each business requires its own Meta business portfolio, WhatsApp Business Account (WABA), and phone number, obtained through Meta's Cloud API Get Started flow
- Use a **system user access token** per business (valid up to 60 days or permanent), not a 24-hour user token
- Default throughput: 80 messages/second per number — sufficient for MVP scale
- Reference: Meta's official Postman collection for the Cloud API

### 13.2 Payments — recommendation

Two integration paths exist for EcoCash/OneMoney:

- **Direct integration:** requires each business to independently apply for and be approved as an EcoCash online merchant (trading license, national ID, proof of residence, merchant ID/PIN issued after manual approval). This is a real barrier to fast multi-tenant onboarding, since every new business on the platform would need to complete this paperwork before they can accept payments.
- **Payment aggregator (recommended for MVP):** services such as Paynow (a Zimbabwean payment gateway) already handle merchant relationships with EcoCash, OneMoney, and card networks, and support sub-merchant or split-payment models. Onboarding a new business through an aggregator is a much faster, self-service process than direct EcoCash merchant approval.

**Recommendation:** build the Payments function/tool layer against an aggregator's API for MVP, with the interface designed so a business that already has its own direct EcoCash merchant account can be plugged in later without changing the orchestrator or order flow — only the Payments service's internal implementation changes.

### 13.3 Future integrations (Phase 2+)

- Accounting software (e.g. via their own APIs or MCP servers, if available)
- Delivery/courier apps
- SMS fallback for customers without WhatsApp
- Other AI clients/products connecting via the platform's own MCP server (Section 10.7)

---

## 14. Multi-tenancy & data isolation

- **Isolation model (SME default):** shared database, shared application/MCP layer, logical isolation via `business_id` enforced through EF Core global query filters on every tenant-scoped row and every query (see Section 11).
- **Isolation model (enterprise option):** for large customers who require it contractually (data residency, internal security policy), the same schema supports a **dedicated deployment** — a separate database (or separate database schema) and, if required, separate application instance for that customer, using identical application code. This is a deployment-configuration decision, not a different codebase, because every query is already scoped through `business_id` and the repository layer (Section 11) rather than assuming a single shared database.
- **Multi-branch enterprise accounts:** an enterprise customer is modeled as one parent `business` account with multiple branch-level sub-accounts (or a `parent_business_id` on the `businesses` table), each with its own WhatsApp connection (Section 13.1) and catalog, but rolling up into shared reporting and centralized user/role management for head-office staff.
- **WhatsApp routing:** each business (or branch) has its own WABA and phone number (see 13.1) — the ingress endpoint resolves tenant identity directly from the receiving number, with no ambiguity or shared-number code parsing required.
- **Resource limits:** per-tenant rate limiting on message processing and API calls, so one business's traffic spike cannot degrade service for others; enterprise accounts with higher volume needs use Meta's throughput capacity upgrades (Section 13.1) rather than a different architecture.
- **Onboarding:** self-service for SME (Section 19); enterprise accounts follow the same technical onboarding steps but are typically set up with sales/support assistance and a signed contract/SLA rather than pure self-service.
- **External MCP clients are tenant-scoped too:** an integration account (Section 11, `mcp_integration_accounts`) is issued per business with explicit scoped permissions, never a platform-wide credential.

---

## 15. Security & compliance

- **Encryption:** TLS for all data in transit; encryption at rest for the database, with WhatsApp system user tokens, payment credentials, AI provider API keys, and MCP integration credentials stored in a dedicated secrets manager (e.g. Azure Key Vault) — never in application config or source control.
- **Access control:** role-based access within each business (owner/admin/staff), implemented with ASP.NET Core Identity or an equivalent; platform admin access is separately authenticated and logged; external MCP clients authenticate with their own scoped credential (Section 14).
- **Enterprise identity (SSO/SAML):** large customers with their own identity provider (Azure AD/Entra ID, Okta, etc.) need single sign-on for their staff rather than platform-managed passwords. ASP.NET Core Identity supports federating to an external SAML/OIDC provider per enterprise account without changing the underlying role model — this should be built as a configurable option per business, not a separate system.
- **Enterprise compliance requests:** larger customers may require a signed data processing agreement, evidence of security practices (e.g. a SOC 2-style questionnaire), and clearer data residency commitments than a typical SME asks for. These should be anticipated in vendor/legal documentation prepared alongside the Section 15 legal review, even before a specific enterprise customer asks.
- **Audit logging:** every state-changing action, including AI-initiated sensitive-action requests and their approval outcome, and every action taken through the MCP server by an external client, recorded in the audit log table (Section 11), retained for a defined period (recommend minimum 12 months, confirm against local regulatory requirement).
- **Data protection law:** operating in Zimbabwe, the platform should be built to comply with the Cyber and Data Protection Act (2021), which governs collection, processing, and storage of personal data. This requires, at minimum: a documented lawful basis for processing customer data (order fulfillment), a data retention policy, and a process for handling data subject requests. **This should be reviewed with legal counsel before launch** — it is flagged here rather than assumed away.
- **Payment data:** using a payment aggregator (Section 13.2) keeps most PCI-relevant card-handling scope off the platform's own servers; the platform should never store full card numbers, and mobile money PINs are never transmitted through or stored by the platform.
- **Webhook verification:** every inbound webhook (WhatsApp, payment provider) must verify the sender's signature before processing, to prevent spoofed events.
- **AI action safety:** sensitive-action gating (Section 10.5) is enforced in the service layer itself, not only in the model's instructions, so it cannot be bypassed by prompt manipulation — and this holds regardless of whether the call originates from the in-app orchestrator or an external MCP client.

---

## 16. Infrastructure & deployment

- **Environments:** separate development, staging, and production environments, each with isolated databases and credentials.
- **Containerization:** ASP.NET Core services packaged as Docker containers for consistent deployment across environments.
- **CI/CD:** automated build, test, and deploy pipeline (e.g. GitHub Actions or Azure DevOps); production deploys require passing the automated test suite (Section 18).
- **Monitoring & alerting:** structured logging (e.g. Serilog) centralized; alerts on webhook failures, payment reconciliation mismatches, elevated error rates, repeated approval-request timeouts, and AI provider errors/latency spikes.
- **Backups:** automated daily database backups with periodic restore testing (Section 7 — RPO 24h, RTO 4h for MVP).
- **Scaling:** stateless ASP.NET Core services that can scale horizontally behind a load balancer; database scaling (read replicas, connection pooling) planned before tenant count makes it necessary, not after.

---

## 17. Technology stack

| Layer | Recommendation | Rationale |
|---|---|---|
| Backend / orchestrator | ASP.NET Core (C#) | Native fit for the AI integration architecture in Section 10; strong typing for function/tool contracts |
| AI provider abstraction | Microsoft.Extensions.AI (`IChatClient`) | Decouples the app from any single model vendor; enables switching or mixing Anthropic/OpenAI/Google without rewriting the orchestrator (Section 10.1) |
| Database | PostgreSQL with a vector extension | Multi-tenant patterns via EF Core global query filters; same store supports RAG embeddings (Section 10.6), avoiding a second system for MVP |
| ORM / data access | Entity Framework Core | Global query filters give tenant isolation by default (Section 11) |
| MCP server | Official MCP C# SDK | Exposes the same C# functions as MCP tools without duplicating logic, and is what external AI clients connect to (Section 10.7) |
| Queue | A managed message queue with at-least-once delivery (e.g. Azure Service Bus) | Needed for idempotent, resilient webhook processing |
| Dashboard frontend | React (or Blazor, if the team prefers staying entirely in .NET) | React for wide component ecosystem; Blazor for a single-language full stack — confirm team preference. Either must support consuming a streaming chat endpoint (Section 12.3) |
| Secrets management | Azure Key Vault (or equivalent) | Required for WhatsApp tokens, payment credentials, AI provider keys, and MCP integration credentials |
| Hosting | Azure App Service / Azure Container Apps (or any cloud with strong .NET + PostgreSQL support) | Reduces undifferentiated infrastructure work for a small team, first-class .NET support |

---

## 18. Testing strategy

- **Unit tests:** business logic (pricing, stock reservation, order state transitions, approval gating) as standard xUnit/NUnit tests against the C# service layer.
- **Integration tests:** function/tool calls against a test database; webhook handlers against recorded WhatsApp and payment provider payloads; MCP server contract tests, including tests against a second/mock AI provider to confirm the abstraction layer holds.
- **Cross-tenant isolation tests:** automated tests that attempt to read/write another tenant's data (bypassing the global query filter deliberately) and assert failure — run against both the in-app orchestrator path and the MCP server path.
- **End-to-end tests:** full order flow in a staging environment using WhatsApp's test numbers and the payment provider's sandbox.
- **Approval-flow tests:** verify a sensitive action never executes without a corresponding approved `pending_approvals` record, including adversarial prompts attempting to talk the model into skipping the request.
- **RAG evaluation:** a test set of policy/FAQ questions per pilot business, checked against expected grounded answers and correct citations, to catch retrieval, hallucination, or mis-attribution issues before launch.
- **Streaming tests:** verify the dashboard chat endpoint streams incrementally and degrades to a complete response if streaming isn't supported by the client.
- **Load testing:** simulate concurrent conversations across multiple tenants before onboarding beyond pilot scale.
- **User acceptance testing (UAT):** pilot businesses run real orders in a controlled window before public rollout, with structured feedback collection.

---

## 19. Business onboarding flow

1. Owner signs up and creates a workspace.
2. Owner adds catalog items (name, price, stock quantity).
3. Owner connects WhatsApp via Meta's Cloud API onboarding (creates/links WABA and phone number).
4. Owner connects a payment method (aggregator onboarding, see 13.2).
5. Owner optionally uploads internal documents (policies, FAQs) for the RAG-backed assistant.
6. Owner configures which action types require approval (Section 10.5), or accepts sensible defaults.
7. Platform runs a guided test order so the owner can see the flow end-to-end before going live.
8. Owner activates the business; the WhatsApp number starts accepting live customer orders.

---

## 20. Business model (recommendation)

Not yet defined by the founder; the following is a starting recommendation to validate, not a decision:

- **Tiered subscription (SME):** a base tier (WhatsApp ordering + catalog + dashboard) and higher tiers unlocking later modules (accounting, automation builder, AI Business Brain, RAG document limits, MCP integration accounts) as they ship.
- **Usage-based component:** optionally, a small per-transaction fee on payments processed, common in this category and easy to justify since it scales with the business's own revenue.
- **Enterprise tier (custom):** priced separately, typically per branch/location or as a negotiated contract, including the dedicated-tenancy option (Section 14), SSO (Section 15), higher WhatsApp throughput, a support SLA, and a named account manager. Not a self-service checkout flow — sales-assisted.

This needs a deliberate decision and light market validation with both SME pilot businesses and prospective enterprise customers before being finalized — flagged here rather than assumed.

---

## 21. Risks & mitigations

| Risk | Mitigation |
|---|---|
| AI misinterprets an order (wrong item/quantity) | Confirmation step before invoicing; scoped function access; human review path for low-confidence parses |
| AI executes a sensitive action incorrectly or is manipulated into skipping approval | Approval gating enforced in the service layer itself (Section 10.5), not just prompt instructions; adversarial tests in QA |
| RAG answers drift from actual business policy or hallucinate | Retrieval strictly scoped to that business's uploaded documents; citations required on every grounded answer; evaluation set per pilot business before launch |
| Lock-in to a single AI provider | Microsoft.Extensions.AI abstraction (Section 10.1) keeps switching a configuration change, not a rewrite |
| Payment provider approval delays per business | Use an aggregator (Section 13.2) to avoid per-business merchant approval bottlenecks |
| WhatsApp policy/rate changes from Meta | Abstract WhatsApp integration behind an internal interface so a policy change doesn't require a full rewrite |
| Cross-tenant data leakage | EF Core global query filters plus automated isolation tests (Sections 11, 18), applied to both the orchestrator and MCP paths |
| External MCP client misuses access | Scoped, per-business integration credentials (Section 14); same approval gating and audit logging as internal calls |
| Regulatory/data protection exposure | Legal review of the Cyber and Data Protection Act obligations before launch (Section 15) |
| Scope creep toward "every industry, every module" before MVP validation | Roadmap gating (Section 4); MVP intentionally narrow |

---

## 22. Milestones & timeline

*(Indicative — adjust to actual team size and availability.)*

| Milestone | Target |
|---|---|
| Architecture, data model, and .NET project scaffolding finalized | Week 2 |
| Console harness validating provider/prompt/tool design via Microsoft.Extensions.AI | Week 4 |
| WhatsApp Cloud API + payment aggregator sandbox integration working | Week 7 |
| C# function-calling orchestrator working against Catalog/Payments in staging | Week 10 |
| Approval workflow and RAG document ingestion (with citations) working | Week 12 |
| Core order-to-cash flow working end-to-end in staging | Week 13 |
| MCP server exposing the same tools published and tested | Week 15 |
| Pilot with 3-5 real businesses | Week 16-19 |
| MVP public launch (stock-based businesses) | Week 21-23 |
| Phase 1 (service businesses, delivery automation) | +8-10 weeks after MVP launch |
| Phase 2 (streaming AI Business Brain, accounting) | +10-12 weeks after Phase 1 |

---

## 23. Open decisions requiring sign-off

These are genuine decisions, not assumptions — they should be confirmed before or during build, not left implicit:

- [ ] Confirm target launch country/countries and applicable data protection review
- [ ] Confirm payment aggregator choice (e.g. Paynow) vs. direct EcoCash/OneMoney merchant integration
- [ ] Confirm which AI model provider(s) to configure first behind Microsoft.Extensions.AI (Anthropic, OpenAI, Google, or a mix)
- [ ] Confirm pricing/business model (Section 20)
- [ ] Confirm data retention period for audit logs, customer conversations, and uploaded documents
- [ ] Confirm cloud hosting provider (Azure assumed above; confirm or replace)
- [ ] Confirm dashboard frontend choice (React vs. Blazor)
- [ ] Confirm which action types are sensitive-by-default for the approval workflow (Section 10.5)
- [ ] Confirm whether/when external AI clients (Section 10.7) will be allowed to connect, and to which businesses first
- [ ] Confirm initial pilot businesses (names, industries, timeline)
- [ ] Confirm staffing/roles available to build this (Section 5) vs. what needs to be hired or contracted
- [ ] Confirm which enterprise requirements (SSO, dedicated tenancy, custom SLA) are needed for the first enterprise prospect, and by when
- [ ] Confirm whether enterprise sales is handled in-house or needs a dedicated hire/partner (Section 5)

---

## 24. Glossary

- **MCP (Model Context Protocol):** a standard interface letting an AI system call external tools/integrations consistently; here, implemented in C# via the official MCP SDK, both as the internal tool layer and as the mechanism that lets external AI clients (e.g. Claude, ChatGPT) act on the platform through natural language.
- **Microsoft.Extensions.AI:** the .NET abstraction layer (`IChatClient`) used so the platform isn't tied to one AI provider's SDK.
- **WABA:** WhatsApp Business Account.
- **Tenant:** one business using the platform, with isolated data.
- **Aggregator:** a payment gateway that mediates access to multiple payment providers (EcoCash, OneMoney, cards) under one integration.
- **Orchestrator:** the AI component that interprets customer messages and coordinates actions across the C# function/tool layer.
- **RAG (Retrieval-Augmented Generation):** answering questions by first retrieving relevant chunks from a business's own documents, then having the model answer grounded in that retrieved content, with citations back to the source.
- **Sensitive action / human-in-the-loop:** a configured action type (e.g. large refund, paid-order cancellation, sending an email) that the AI may propose but never execute without explicit human approval.
- **Streaming:** returning a model's response incrementally (token by token) to a live UI, used for the dashboard chat assistant.
