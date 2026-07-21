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
    public DateTimeOffset CreatedAt { get; set; }
}
