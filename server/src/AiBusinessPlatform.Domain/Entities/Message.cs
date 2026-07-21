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
}
