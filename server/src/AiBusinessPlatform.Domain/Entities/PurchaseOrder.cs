namespace AiBusinessPlatform.Domain.Entities;

public class PurchaseOrder : ITenantScoped
{
    public Guid Id { get; set; }
    public Guid BusinessId { get; set; }
    public Guid SupplierId { get; set; }
    public PurchaseOrderStatus Status { get; set; } = PurchaseOrderStatus.Draft;
    public string Currency { get; set; } = "USD";
    public decimal TotalAmount { get; set; }
    public decimal AmountPaid { get; set; } // cash actually paid to the supplier so far; AmountOwed = TotalAmount - AmountPaid, never stored
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset? ReceivedAt { get; set; }
}
