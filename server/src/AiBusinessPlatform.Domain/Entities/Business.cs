namespace AiBusinessPlatform.Domain.Entities;

// Tenant root — not itself tenant-scoped (it IS the tenant).
public class Business
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string IndustryType { get; set; } = string.Empty;
    public string Currency { get; set; } = "USD";
    public string Timezone { get; set; } = "Africa/Harare";
    public BusinessStatus Status { get; set; } = BusinessStatus.Active;
    public Guid? ParentBusinessId { get; set; } // Section 14: multi-branch enterprise accounts
    public bool IsPubliclyListed { get; set; } = false; // opt-in to the customer marketplace directory
    public string? Tin { get; set; }
    public string? VatNumber { get; set; }
    public string? Address { get; set; }
    public string? Email { get; set; }
    public string? Phone { get; set; }
    public decimal VatRate { get; set; } = 0; // fraction, e.g. 0.15 for 15% — 0 until the owner opts in
    public string? DeviceSerialNumber { get; set; }
    public string? FiscalDeviceId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
