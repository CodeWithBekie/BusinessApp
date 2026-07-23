namespace AiBusinessPlatform.Domain.Entities;

// Section 13.2 — each business connects its own Paynow merchant integration. Unlike WhatsApp
// (one shared app-level AppSecret/VerifyToken), Paynow's Integration ID + Key are issued per
// merchant account, so both live here rather than in app config.
public class PaynowConnection : ITenantScoped
{
    public Guid Id { get; set; }
    public Guid BusinessId { get; set; }
    public string IntegrationId { get; set; } = string.Empty;

    // Encrypted at rest in production (Section 15); stored via secrets manager reference, not
    // plaintext, once wired up — same known gap already flagged on WhatsAppConnection.SystemUserToken.
    public string IntegrationKey { get; set; } = string.Empty;

    // Paynow requires a valid-looking auth email for mobile (Express Checkout) transactions even
    // though customers pay by phone/PIN — no customer email is collected anywhere in this system,
    // so this is a business-level stand-in used for every transaction.
    public string NotificationEmail { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
}
