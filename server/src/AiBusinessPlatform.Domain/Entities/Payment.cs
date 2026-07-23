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

    // Paynow-specific, both null when Provider == Other (manual/offline fallback, no real
    // aggregator call was made). ExternalReference is Paynow's own paynowreference (captured once
    // known, for future reconciliation, Section 6.4 FR24); PollUrl lets GetPaymentStatusAsync
    // check status without needing a fresh initiate call.
    public string? ExternalReference { get; set; }
    public string? PollUrl { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? ConfirmedAt { get; set; }
}
