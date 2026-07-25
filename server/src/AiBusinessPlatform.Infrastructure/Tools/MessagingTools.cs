using System.Text.Json;
using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Tools;
using AiBusinessPlatform.Domain;
using AiBusinessPlatform.Domain.Entities;
using AiBusinessPlatform.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace AiBusinessPlatform.Infrastructure.Tools;

public class MessagingTools(
    AiBusinessPlatformDbContext dbContext, ICurrentTenantProvider tenantProvider, IApprovalTools approvalTools, IWhatsAppSender whatsAppSender)
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

    // Mirrors WhatsAppOrchestratorConsumer.TrySendRealWhatsAppMessageAsync's connection-resolution +
    // send pattern (duplicated by necessity — that method is private to a different project) and
    // OrderTools.SendCustomerMessageAsync's outbound-Message persistence pattern.
    public async Task SendApprovedCustomerMessageAsync(Guid businessId, Guid customerId, string text, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        var customer = await dbContext.Customers.FirstOrDefaultAsync(c => c.Id == customerId && c.BusinessId == businessId, cancellationToken)
            ?? throw new InvalidOperationException($"Customer {customerId} not found.");

        var connection = await dbContext.WhatsAppConnections
            .FirstOrDefaultAsync(c => c.BusinessId == businessId && c.Status == WhatsAppConnectionStatus.Active, cancellationToken)
            ?? throw new InvalidOperationException("This business has no connected WhatsApp number.");

        await whatsAppSender.SendTextMessageAsync(connection.PhoneNumberId, connection.SystemUserToken, customer.WhatsAppNumber, text, cancellationToken);

        var conversation = await dbContext.Conversations
            .FirstOrDefaultAsync(c => c.CustomerId == customerId && c.Status == ConversationStatus.Open, cancellationToken);
        if (conversation is not null)
        {
            dbContext.Messages.Add(new Message
            {
                Id = Guid.NewGuid(),
                BusinessId = businessId,
                ConversationId = conversation.Id,
                Direction = MessageDirection.Outbound,
                Content = text,
                CreatedAt = DateTimeOffset.UtcNow
            });
        }

        await dbContext.SaveChangesAsync(cancellationToken);
    }
}
