using System.ComponentModel;
using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Tools;
using Microsoft.Extensions.AI;
using ModelContextProtocol.Server;

namespace AiBusinessPlatform.Mcp.Tools;

// Part 3 (sampling) — asks the CONNECTED CLIENT's own model to draft the message text via
// McpServer.SampleAsync, rather than this server needing its own separate LLM client/API key.
// Never sends directly: the draft is persisted as a PendingApproval (ApprovalActionTypes.
// SendCustomerMessage) and only actually reaches WhatsApp once a human approves it — same
// human-in-the-loop principle Section 10.5 already applies to cancel_paid_order.
[McpServerToolType]
public class CustomerMessagingMcpTools(ICustomerTools customerTools, IMessagingTools messagingTools, ICurrentTenantProvider tenantProvider)
{
    [McpServerTool(Name = "draft_customer_message"), Description("Drafts a WhatsApp message to a customer using the connected AI model's own language ability, for the owner to review before it sends. NEVER sends automatically — creates a pending approval (viewable in the Approvals tab, or decided via decide_approval) that must be approved before the message actually reaches the customer. Use for order updates, replies to a complaint, payment reminders, etc. Resolve customerId via list_customers first — never guess an id.")]
    public async Task<DraftedMessageResult> DraftCustomerMessage(Guid customerId, string intent, McpServer server, CancellationToken cancellationToken = default)
    {
        var businessId = tenantProvider.CurrentBusinessId;
        var customer = await customerTools.GetCustomerAsync(businessId, customerId, cancellationToken);

        var response = await server.SampleAsync(
            [
                new ChatMessage(ChatRole.User,
                    $"Draft a short, friendly WhatsApp message to a customer named {customer.Name ?? "the customer"}. " +
                    $"What the message needs to convey: {intent}. Keep it under 300 characters, plain text, no markdown, " +
                    "no formal letter greeting — write like a real WhatsApp text.")
            ],
            new ChatOptions { MaxOutputTokens = 200 },
            cancellationToken: cancellationToken);

        var draftedText = response.Text.Trim();
        var pendingApprovalId = await messagingTools.RequestSendCustomerMessageApprovalAsync(businessId, customerId, draftedText, cancellationToken);
        return new DraftedMessageResult(pendingApprovalId, draftedText);
    }
}
