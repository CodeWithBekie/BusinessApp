namespace AiBusinessPlatform.Domain.Entities;

// Section 13.1 — each business (or branch) connects its own WABA + phone number.
public class WhatsAppConnection : ITenantScoped
{
    public Guid Id { get; set; }
    public Guid BusinessId { get; set; }
    public string WabaId { get; set; } = string.Empty;
    public string PhoneNumberId { get; set; } = string.Empty;

    // Encrypted at rest in production (Section 15); stored via secrets manager reference, not plaintext, once wired up.
    public string SystemUserToken { get; set; } = string.Empty;
    public WhatsAppConnectionStatus Status { get; set; } = WhatsAppConnectionStatus.Pending;
    public DateTimeOffset CreatedAt { get; set; }
}
