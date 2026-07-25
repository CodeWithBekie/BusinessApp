using System.ComponentModel;

namespace AiBusinessPlatform.Application.Tools;

public record DraftedMessageResult(Guid PendingApprovalId, string DraftedText);

// New ground, not a spec section — lets the draft_customer_message MCP tool (Part 3, sampling)
// persist an LLM-drafted WhatsApp reply as a PendingApproval rather than sending it directly, and
// lets the approval-decide dispatch (DashboardEndpoints.cs / ApprovalMcpTools.cs) actually send it
// once a human approves. Shared by both entry points, same "one function, multiple entry points"
// shape as every other tool interface.
public interface IMessagingTools
{
    [Description("Persists a drafted customer message as a pending approval instead of sending it directly.")]
    Task<Guid> RequestSendCustomerMessageApprovalAsync(Guid businessId, Guid customerId, string draftedText, CancellationToken cancellationToken = default);

    [Description("Sends a previously-approved customer message via WhatsApp and records it in the customer's conversation.")]
    Task SendApprovedCustomerMessageAsync(Guid businessId, Guid customerId, string text, CancellationToken cancellationToken = default);
}
