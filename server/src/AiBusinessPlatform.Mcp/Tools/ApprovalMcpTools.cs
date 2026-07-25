using System.ComponentModel;
using System.Text.Json;
using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Tools;
using AiBusinessPlatform.Domain;
using ModelContextProtocol.Server;

namespace AiBusinessPlatform.Mcp.Tools;

// Section 10.5/10.7 — the same IApprovalTools the dashboard's decision endpoint calls, exposed here
// for external AI clients and the in-app Assistant. This does NOT bypass the human-in-the-loop
// principle: decide_approval only ever runs as the authenticated business owner acting through
// their own Assistant (decidedBy resolved server-side, never from the model) — the same person who
// would otherwise tap Approve/Reject in the dashboard. The CancelPaidOrder dispatch below mirrors
// DashboardEndpoints.cs's decision endpoint exactly, since that orchestration glue is expected to
// exist at each entry point (same as the WhatsApp orchestrator's own tool composition).
[McpServerToolType]
public class ApprovalMcpTools(
    IApprovalTools approvalTools, IOrderTools orderTools, IMessagingTools messagingTools,
    ICurrentTenantProvider tenantProvider, ICurrentUserProvider userProvider)
{
    // Nullable parameters need an explicit `= null` default — see CatalogMcpTools' remarks.
    [McpServerTool(Name = "list_pending_approvals"), Description("Lists this business's pending-approval requests, most recent first, optionally filtered to one status: \"Pending\", \"Approved\", or \"Rejected\".")]
    public Task<IReadOnlyList<ApprovalSummary>> ListPendingApprovals(ApprovalStatus? status = null, CancellationToken cancellationToken = default)
        => approvalTools.ListApprovalsAsync(tenantProvider.CurrentBusinessId, status, cancellationToken);

    [McpServerTool(Name = "decide_approval"), Description("Approves or rejects a pending-approval request. Only call this when the owner has clearly and explicitly stated their decision — if it's ambiguous which request they mean or what they decided, ask a clarifying question instead of calling this.")]
    public async Task<ApprovalDecisionResult> DecideApproval(Guid pendingApprovalId, bool approve, CancellationToken cancellationToken = default)
    {
        var businessId = tenantProvider.CurrentBusinessId;
        var decidedBy = userProvider.CurrentUserId;

        var decision = await approvalTools.DecideApprovalAsync(businessId, pendingApprovalId, approve, decidedBy, cancellationToken);

        if (!decision.WasAlreadyDecided && decision.ActionType == ApprovalActionTypes.CancelPaidOrder)
        {
            var details = JsonSerializer.Deserialize<CancelPaidOrderDetails>(decision.DetailsJson)!;
            if (approve)
            {
                await orderTools.CancelPaidOrderAsync(businessId, details.OrderId, decidedBy, cancellationToken);
            }
            else
            {
                await orderTools.NotifyOrderCancellationRejectedAsync(businessId, details.OrderId, decidedBy, cancellationToken);
            }
        }
        else if (!decision.WasAlreadyDecided && decision.ActionType == ApprovalActionTypes.SendCustomerMessage)
        {
            var details = JsonSerializer.Deserialize<SendCustomerMessageDetails>(decision.DetailsJson)!;
            if (approve)
            {
                await messagingTools.SendApprovedCustomerMessageAsync(businessId, details.CustomerId, details.DraftedText, cancellationToken);
            }
        }

        return decision;
    }
}
