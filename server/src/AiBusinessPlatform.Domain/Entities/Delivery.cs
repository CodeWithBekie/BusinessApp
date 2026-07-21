namespace AiBusinessPlatform.Domain.Entities;

public class Delivery : ITenantScoped
{
    public Guid Id { get; set; }
    public Guid BusinessId { get; set; } // denormalized for tenant-scoped query filter (Section 11)
    public Guid OrderId { get; set; }
    public DeliveryStatus Status { get; set; } = DeliveryStatus.Pending;
    public string? DriverName { get; set; }
    public string? Notes { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
