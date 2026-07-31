namespace AiBusinessPlatform.Domain.Entities;

// Real EcoCash Instant Payment sandbox integration — a genuine alternate gateway alongside
// PaynowConnection, not a replacement (PaynowConnection's own "ecocash" method remains available).
// Each business connects its own EcoCash merchant sandbox credentials, mirroring PaynowConnection's
// per-business storage rationale exactly.
public class EcoCashConnection : ITenantScoped
{
    public Guid Id { get; set; }
    public Guid BusinessId { get; set; }

    // HTTP Basic auth credentials issued by the EcoCash developer sandbox portal.
    public string Username { get; set; } = string.Empty;

    // Encrypted at rest in production (Section 15); stored via secrets manager reference, not
    // plaintext, once wired up — same known gap already flagged on PaynowConnection.IntegrationKey.
    public string Password { get; set; } = string.Empty;

    // Merchant identity fields required on every charge/refund request body.
    public string MerchantCode { get; set; } = string.Empty;
    public string MerchantPin { get; set; } = string.Empty; // secret, same at-rest caveat as Password
    public string MerchantNumber { get; set; } = string.Empty;
    public string MerchantName { get; set; } = string.Empty;
    public string SuperMerchantName { get; set; } = string.Empty;
    public string CountryCode { get; set; } = "ZW";
    public string TerminalId { get; set; } = "TERM001";
    public string Location { get; set; } = string.Empty;

    public DateTimeOffset CreatedAt { get; set; }
}
