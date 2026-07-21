namespace AiBusinessPlatform.Domain.Entities;

public class Conversation : ITenantScoped
{
    public Guid Id { get; set; }
    public Guid BusinessId { get; set; }
    public Guid CustomerId { get; set; }
    public string WhatsAppThreadId { get; set; } = string.Empty;
    public ConversationStatus Status { get; set; } = ConversationStatus.Open;
    public DateTimeOffset CreatedAt { get; set; }
}
