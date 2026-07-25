namespace AiBusinessPlatform.Domain.Entities;

public class Message : ITenantScoped
{
    public Guid Id { get; set; }
    public Guid BusinessId { get; set; } // denormalized for tenant-scoped query filter (Section 11)
    public Guid ConversationId { get; set; }
    public MessageDirection Direction { get; set; }
    public string Content { get; set; } = string.Empty;
    public string? WhatsAppMessageId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    // Delivery/retry tracking — only meaningful for Direction == Outbound (see MessageDeliveryStatus).
    public MessageDeliveryStatus Status { get; set; } = MessageDeliveryStatus.Pending;
    public int AttemptCount { get; set; }
    public DateTimeOffset? NextAttemptAt { get; set; }
    public string? LastError { get; set; }
    public DateTimeOffset? DeliveredAt { get; set; }
    public DateTimeOffset? ReadAt { get; set; }
}
