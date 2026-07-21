namespace AiBusinessPlatform.Domain.Entities;

public class OrderItem : ITenantScoped
{
    public Guid Id { get; set; }
    public Guid BusinessId { get; set; } // denormalized for tenant-scoped query filter (Section 11)
    public Guid OrderId { get; set; }
    public Guid CatalogItemId { get; set; }
    public int Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal Subtotal { get; set; }
}
