# Contracts/

Request/response DTOs (C# `record`s) consumed by `../Endpoints/*.cs`. Roughly one file per logical
contract group rather than strictly one file per DTO — e.g. `AccountingRequests.cs`,
`CatalogRequests.cs`, `StaffRequests.cs`, `SupplierRequests.cs`, and `PurchaseOrderRequests.cs`
each bundle several related request records; `SalesResponses.cs` bundles response shapes.

Also here: queue envelope shapes shared with the background consumers in `../Orchestrator/` and
`../Payments/` (`WhatsAppInboundQueueMessage.cs`, `PaymentConfirmedQueueMessage.cs`) and the
dev-only webhook simulation stand-ins (`SimulatedWhatsAppMessage.cs`, `SimulatedPaymentWebhook.cs`).

There's no logic here beyond simple validation-friendly shapes — if you're looking for where a
request actually gets processed, follow the DTO's name to the matching route in `../Endpoints/`.
