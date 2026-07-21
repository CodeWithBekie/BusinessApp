namespace AiBusinessPlatform.Application.Tools;

// Section 10.5 — the fixed registry of sensitive ActionType values a PendingApproval.ActionType
// can hold, and the DetailsJson shape for each, so the producer (the tool that raises the
// approval) and the consumer (the decision endpoint's dispatch) agree on both without stringly-
// typed duplication. Add a new const + details record here, and a new dispatch branch at the
// decision endpoint, when a 2nd sensitive action type is introduced.
public static class ApprovalActionTypes
{
    public const string CancelPaidOrder = "cancel_paid_order";
}

public record CancelPaidOrderDetails(Guid OrderId, Guid CustomerId, decimal Amount, string Currency, string? Reason, DateTimeOffset RequestedAt);
