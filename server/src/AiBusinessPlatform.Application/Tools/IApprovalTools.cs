using System.ComponentModel;
using AiBusinessPlatform.Domain;

namespace AiBusinessPlatform.Application.Tools;

public record RequestApprovalResult(Guid PendingApprovalId);

public record ApprovalStatusResult(Guid PendingApprovalId, string Status);

public record ApprovalDecisionResult(Guid PendingApprovalId, string ActionType, string DetailsJson, string Status, bool WasAlreadyDecided);

public record ApprovalSummary(
    Guid Id, string ActionType, string DetailsJson, ApprovalStatus Status,
    DateTimeOffset RequestedAt, DateTimeOffset? DecidedAt, Guid? DecidedBy);

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

    // Not AI-facing in the sense of the customer-facing WhatsApp orchestrator — Section 10.5's
    // human-in-the-loop principle is preserved because the MCP server's decide_approval tool
    // (Section 10.7) only ever runs as the authenticated business owner acting through their own
    // Assistant, with decidedBy resolved server-side (ICurrentUserProvider), never from the model.
    Task<ApprovalDecisionResult> DecideApprovalAsync(Guid businessId, Guid pendingApprovalId, bool approve, Guid? decidedBy, CancellationToken cancellationToken = default);

    [Description("Lists this business's pending-approval requests, most recent first, optionally filtered to one status: \"Pending\", \"Approved\", or \"Rejected\".")]
    Task<IReadOnlyList<ApprovalSummary>> ListApprovalsAsync(Guid businessId, ApprovalStatus? status, CancellationToken cancellationToken = default);
}
