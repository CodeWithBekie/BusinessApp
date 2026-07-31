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

    // EcoCash-specific — the (normalized, international-format) phone number that was actually
    // charged, needed later by GetPaymentStatusAsync to call EcoCash's real status-check endpoint
    // (GET /{endUserId}/transactions/amount/{clientCorrelator} — clientCorrelator is ProviderReference).
    // Null for every other provider/path.
    public string? EcoCashEndUserId { get; set; }

    // Cash-tender tracking (POS only) — lets the receipt show what was handed over and the change
    // given back; ChangeDue is computed at read time (AmountTendered - Amount), never persisted.
    public decimal? AmountTendered { get; set; }

    // Customer-uploaded proof of an off-gateway payment (bank/EcoCash transfer screenshot),
    // reviewed via the same PendingApproval mechanism as cancel_paid_order — no separate
    // "AwaitingReview" PaymentStatus needed, the approval row's own status is the review signal.
    public byte[]? ProofImageData { get; set; }
    public string? ProofImageContentType { get; set; }
    public DateTimeOffset? ProofSubmittedAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? ConfirmedAt { get; set; }
}
