namespace AiBusinessPlatform.Domain.Entities;

public class PurchaseOrderItem : ITenantScoped
{
    public Guid Id { get; set; }
    public Guid BusinessId { get; set; } // denormalized for tenant-scoped query filter (Section 11)
    public Guid PurchaseOrderId { get; set; }

    // Null until the item is created in the catalog at receiving time — see NewItemName/Type/Unit.
    public Guid? CatalogItemId { get; set; }
    public string? NewItemName { get; set; }
    public CatalogItemType? NewItemType { get; set; }
    public string? NewItemUnit { get; set; }

    public int Quantity { get; set; }
    public decimal UnitCost { get; set; }
    public decimal Subtotal { get; set; }
}
