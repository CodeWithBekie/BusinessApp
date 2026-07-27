using AiBusinessPlatform.Domain;

namespace AiBusinessPlatform.Api.Contracts;

public record CreateExpenseRequest(
    ExpenseCategory Category, string Description, decimal Amount, string? Currency, PaymentProvider PaymentMethod, DateTimeOffset? IncurredAt);

public record RecordSupplierPaymentRequest(decimal Amount, PaymentProvider Provider);
