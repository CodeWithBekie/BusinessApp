# AiBusinessPlatform.Domain

The innermost layer — entities and enums only, zero project references (the `.csproj` has no
`ProjectReference` at all, just a `Pgvector` package reference for the `Vector` type used by
`DocumentChunk.Embedding`). Nothing here knows about EF Core, HTTP, or any other project.

- **`Enums.cs`** — every domain enum in one file: `BusinessStatus`, `BusinessUserRole`,
  `CatalogItemType`, `TimeSlotStatus`, `ConversationStatus`, `MessageDirection`,
  `MessageDeliveryStatus`, `OrderStatus`, `PaymentProvider`, `PaymentStatus`, `DeliveryStatus`,
  `ApprovalStatus`, `AuditActorType`, `WhatsAppConnectionStatus`, `McpIntegrationAccountStatus`,
  `PurchaseOrderStatus`, `ExpenseCategory`, `AccountType`.
- **`ITenantScoped.cs`** — the marker interface (`Guid BusinessId { get; set; }`) every
  tenant-scoped entity implements. `Infrastructure/Data/AiBusinessPlatformDbContext.cs` reflects
  over the whole model at startup and applies a `BusinessId` query filter to every entity type that
  implements this — see `Entities/README.md` for which entities are exempt (the tenant root itself
  and the marketplace customer identity) and why.
- **`Entities/`** — every entity class. See its own README.
