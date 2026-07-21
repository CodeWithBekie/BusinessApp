namespace AiBusinessPlatform.Domain.Entities;

public class Payment : ITenantScoped
{
    public Guid Id { get; set; }
    public Guid BusinessId { get; set; } // denormalized for tenant-scoped query filter (Section 11)
    public Guid OrderId { get; set; }
    public PaymentProvider Provider { get; set; }
    public string ProviderReference { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public PaymentStatus Status { get; set; } = PaymentStatus.Pending;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? ConfirmedAt { get; set; }
}
