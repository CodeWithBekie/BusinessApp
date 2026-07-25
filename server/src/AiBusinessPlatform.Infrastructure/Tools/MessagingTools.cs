using System.Text.Json;
using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Tools;
using AiBusinessPlatform.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace AiBusinessPlatform.Infrastructure.Tools;

public class MessagingTools(
    AiBusinessPlatformDbContext dbContext, ICurrentTenantProvider tenantProvider, IApprovalTools approvalTools, IWhatsAppMessageService whatsAppMessageService)
    : IMessagingTools
{
    public async Task<Guid> RequestSendCustomerMessageApprovalAsync(Guid businessId, Guid customerId, string draftedText, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }
        if (string.IsNullOrWhiteSpace(draftedText))
        {
            throw new ArgumentException("draftedText is required.", nameof(draftedText));
        }

        var customerExists = await dbContext.Customers.AnyAsync(c => c.Id == customerId && c.BusinessId == businessId, cancellationToken);
        if (!customerExists)
        {
            throw new InvalidOperationException($"Customer {customerId} not found.");
        }

        var details = new SendCustomerMessageDetails(customerId, draftedText, DateTimeOffset.UtcNow);
        var result = await approvalTools.RequestApprovalAsync(businessId, ApprovalActionTypes.SendCustomerMessage, JsonSerializer.Serialize(details), cancellationToken);
        return result.PendingApprovalId;
    }

    // Delegates to IWhatsAppMessageService (the one shared place every WhatsApp send goes
    // through) — still synchronous/throws on failure here so the approval-decision caller sees it
    // immediately, matching the existing UX; the difference is the failure is now also persisted
    // with retry scheduling instead of just erroring out once.
    public async Task SendApprovedCustomerMessageAsync(Guid businessId, Guid customerId, string text, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        var result = await whatsAppMessageService.SendAsync(businessId, customerId, text, cancellationToken);
        if (!result.Success)
        {
            throw new InvalidOperationException(result.ErrorMessage ?? "Failed to send WhatsApp message.");
        }
    }
}
