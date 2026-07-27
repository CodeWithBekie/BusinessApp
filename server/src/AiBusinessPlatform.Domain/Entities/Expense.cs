namespace AiBusinessPlatform.Domain.Entities;

public class Expense : ITenantScoped
{
    public Guid Id { get; set; }
    public Guid BusinessId { get; set; }
    public ExpenseCategory Category { get; set; }
    public string Description { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "USD";
    public PaymentProvider PaymentMethod { get; set; }
    public DateTimeOffset IncurredAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
