namespace AiBusinessPlatform.Domain.Entities;

public class Supplier : ITenantScoped
{
    public Guid Id { get; set; }
    public Guid BusinessId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? ContactPhone { get; set; }
    public string? Email { get; set; }
    public string? Notes { get; set; }
    public SupplierCategory? Category { get; set; }
    public int? Rating { get; set; }
    public bool Active { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; }
}
