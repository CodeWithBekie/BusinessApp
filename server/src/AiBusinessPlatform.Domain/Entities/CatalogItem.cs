namespace AiBusinessPlatform.Domain.Entities;

public class CatalogItem : ITenantScoped
{
    public Guid Id { get; set; }
    public Guid BusinessId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Code { get; set; }
    public CatalogItemType ItemType { get; set; }
    public decimal Price { get; set; }
    public decimal? Cost { get; set; } // most recent purchase-order unit cost — null until ever purchased
    public string Currency { get; set; } = "USD";
    public int? StockQuantity { get; set; }
    public int LowStockThreshold { get; set; } = 5; // only meaningful when ItemType is Stock
    public string Unit { get; set; } = "each";
    public bool Active { get; set; } = true;
    public byte[]? ImageData { get; set; }
    public string? ImageContentType { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
