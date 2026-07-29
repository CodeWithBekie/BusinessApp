namespace AiBusinessPlatform.Application.Tools;

// Section 10.5 — the fixed registry of sensitive ActionType values a PendingApproval.ActionType
// can hold, and the DetailsJson shape for each, so the producer (the tool that raises the
// approval) and the consumer (the decision endpoint's dispatch) agree on both without stringly-
// typed duplication. Add a new const + details record here, and a new dispatch branch at the
// decision endpoint, when a 2nd sensitive action type is introduced.
public static class ApprovalActionTypes
{
    public const string CancelPaidOrder = "cancel_paid_order";
    public const string SendCustomerMessage = "send_customer_message";
    public const string PaymentProofSubmitted = "payment_proof_submitted";
}

public record CancelPaidOrderDetails(Guid OrderId, Guid CustomerId, decimal Amount, string Currency, string? Reason, DateTimeOffset RequestedAt);

// The draft_customer_message MCP tool (Part 3, sampling) raises this instead of sending directly —
// only approving it (dashboard or decide_approval) actually sends via WhatsApp.
public record SendCustomerMessageDetails(Guid CustomerId, string DraftedText, DateTimeOffset RequestedAt);

// Raised by IMarketplaceTools.SubmitPaymentProofAsync — the proof image itself lives on the
// Payment row (Payment.ProofImageData), not here; this just carries enough to route the decision.
public record PaymentProofSubmittedDetails(Guid OrderId, Guid PaymentId, Guid CustomerAccountId, DateTimeOffset SubmittedAt);
