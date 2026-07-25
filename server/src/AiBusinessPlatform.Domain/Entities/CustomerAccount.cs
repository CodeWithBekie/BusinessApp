namespace AiBusinessPlatform.Domain.Entities;

// Marketplace login identity — deliberately NOT ITenantScoped (mirrors Business itself: this is
// an identity, not tenant data). One CustomerAccount can link to many per-business Customer rows
// (one customer, many businesses), see Customer.CustomerAccountId.
public class CustomerAccount
{
    public Guid Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string? Name { get; set; }
    public string? PhoneNumber { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
