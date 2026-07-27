namespace AiBusinessPlatform.Domain.Entities;

public class Customer : ITenantScoped
{
    public Guid Id { get; set; }
    public Guid BusinessId { get; set; }
    public string WhatsAppNumber { get; set; } = string.Empty;
    public string? Name { get; set; }
    public Guid? CustomerAccountId { get; set; } // links to the marketplace login identity, if any
    public string? Tin { get; set; }
    public string? Address { get; set; }
    public string? Email { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
