using System.ComponentModel;

namespace AiBusinessPlatform.Application.Tools;

public record RequestApprovalResult(Guid PendingApprovalId);

public record ApprovalStatusResult(Guid PendingApprovalId, string Status);

public record ApprovalDecisionResult(Guid PendingApprovalId, string ActionType, string DetailsJson, string Status, bool WasAlreadyDecided);

// Section 10.5 — human-in-the-loop gating. The orchestrator calls RequestApprovalAsync INSTEAD OF
// the real sensitive action; only a dashboard decision endpoint (never the AI) resolves it.
// This contract has no direct "execute" path — that enforcement lives in the real implementation
// once written, so it can't be bypassed by prompt manipulation.
public interface IApprovalTools
{
    [Description("Raises a pending-approval record for a sensitive action instead of executing it directly.")]
    Task<RequestApprovalResult> RequestApprovalAsync(Guid businessId, string actionType, string detailsJson, CancellationToken cancellationToken = default);

    [Description("Gets the current status (pending/approved/rejected) of a previously raised approval request.")]
    Task<ApprovalStatusResult> GetApprovalStatusAsync(Guid pendingApprovalId, CancellationToken cancellationToken = default);

    // Not AI-facing — Section 10.5's "never through the AI itself" rule is enforced structurally
    // by simply never adding this to ChatOptions.Tools anywhere, the same convention
    // IOrderTools.ConfirmPaymentAsync already established.
    Task<ApprovalDecisionResult> DecideApprovalAsync(Guid businessId, Guid pendingApprovalId, bool approve, Guid? decidedBy, CancellationToken cancellationToken = default);
}
