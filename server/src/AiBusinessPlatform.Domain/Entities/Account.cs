namespace AiBusinessPlatform.Domain.Entities;

// Chart-of-accounts row — a fixed, standard set lazily seeded per business by
// ILedgerPostingService.EnsureChartOfAccountsAsync. No dynamic account-creation UI/API. Code is
// the stable, code-referenced identifier (e.g. "cash", "sales_revenue") both the posting service
// and reporting queries key off of; Name is the human-readable label.
public class Account : ITenantScoped
{
    public Guid Id { get; set; }
    public Guid BusinessId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public AccountType Type { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
