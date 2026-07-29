namespace AiBusinessPlatform.Domain.Entities;

// Header row for one auto-posted double-entry transaction — never manually entered (Phase 2:
// "journal entries per sale"). SourceType/SourceId trace back to what triggered it, mirroring
// AuditLog's EntityType/EntityId. PostedAt is the business moment (Payment.ConfirmedAt /
// Expense.IncurredAt / PurchaseOrder.ReceivedAt), not just row-insert time.
public class JournalEntry : ITenantScoped
{
    public Guid Id { get; set; }
    public Guid BusinessId { get; set; }
    public string Description { get; set; } = string.Empty;
    public string Currency { get; set; } = "USD";
    public string SourceType { get; set; } = string.Empty; // "Sale" | "Expense" | "PurchaseReceipt" | "SupplierPayment"
    public string SourceId { get; set; } = string.Empty;
    public DateTimeOffset PostedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
