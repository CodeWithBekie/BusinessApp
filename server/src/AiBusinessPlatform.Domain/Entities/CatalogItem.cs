namespace AiBusinessPlatform.Domain.Entities;

public class CatalogItem : ITenantScoped
{
    public Guid Id { get; set; }
    public Guid BusinessId { get; set; }
    public string Name { get; set; } = string.Empty;
    public CatalogItemType ItemType { get; set; }
    public decimal Price { get; set; }
    public string Currency { get; set; } = "USD";
    public int? StockQuantity { get; set; }
    public string Unit { get; set; } = "each";
    public bool Active { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
