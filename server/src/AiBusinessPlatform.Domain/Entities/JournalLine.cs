namespace AiBusinessPlatform.Domain.Entities;

// One debit or credit leg of a JournalEntry. Exactly one of Debit/Credit is > 0 per line (never
// both) — enforced in LedgerPostingService, not a DB constraint, matching how invariants
// elsewhere in this codebase live in the tools layer rather than the database.
public class JournalLine : ITenantScoped
{
    public Guid Id { get; set; }
    public Guid BusinessId { get; set; }
    public Guid JournalEntryId { get; set; }
    public Guid AccountId { get; set; }
    public decimal Debit { get; set; }
    public decimal Credit { get; set; }
}
