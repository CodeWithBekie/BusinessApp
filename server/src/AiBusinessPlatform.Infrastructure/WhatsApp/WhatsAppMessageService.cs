using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Domain;
using AiBusinessPlatform.Domain.Entities;
using AiBusinessPlatform.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace AiBusinessPlatform.Infrastructure.WhatsApp;

public class WhatsAppMessageService(AiBusinessPlatformDbContext dbContext, IWhatsAppSender whatsAppSender) : IWhatsAppMessageService
{
    public async Task<SendWhatsAppMessageResult> SendAsync(Guid businessId, Guid customerId, string text, CancellationToken cancellationToken = default)
    {
        var customer = await dbContext.Customers.FirstOrDefaultAsync(c => c.Id == customerId && c.BusinessId == businessId, cancellationToken)
            ?? throw new InvalidOperationException($"Customer {customerId} not found.");

        var conversation = await GetOrCreateOpenConversationAsync(businessId, customer, cancellationToken);

        var message = new Message
        {
            Id = Guid.NewGuid(),
            BusinessId = businessId,
            ConversationId = conversation.Id,
            Direction = MessageDirection.Outbound,
            Content = text,
            CreatedAt = DateTimeOffset.UtcNow,
            Status = MessageDeliveryStatus.Pending
        };
        dbContext.Messages.Add(message);

        var connection = await dbContext.WhatsAppConnections
            .FirstOrDefaultAsync(c => c.BusinessId == businessId && c.Status == WhatsAppConnectionStatus.Active, cancellationToken);

        if (connection is null)
        {
            // Terminal — no connection to retry into, retrying won't change that.
            message.Status = MessageDeliveryStatus.Failed;
            message.LastError = "This business has no connected WhatsApp number.";
            await dbContext.SaveChangesAsync(cancellationToken);
            return new SendWhatsAppMessageResult(false, message.LastError);
        }

        await AttemptSendAsync(message, connection, customer.WhatsAppNumber, cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
        return new SendWhatsAppMessageResult(message.Status == MessageDeliveryStatus.Sent, message.LastError);
    }

    public async Task RetryMessageAsync(Guid messageId, CancellationToken cancellationToken = default)
    {
        // Tenant context is already set to this message's business by the caller (WhatsAppRetryHostedService)
        // before resolving this scoped service, so these queries are already correctly tenant-filtered.
        var message = await dbContext.Messages.FirstOrDefaultAsync(m => m.Id == messageId, cancellationToken);
        if (message is null || message.Status != MessageDeliveryStatus.Failed || message.NextAttemptAt is null)
        {
            return; // already resolved (e.g. a status webhook arrived first) or no longer due
        }

        var conversation = await dbContext.Conversations.FirstOrDefaultAsync(c => c.Id == message.ConversationId, cancellationToken);
        var customer = conversation is null ? null : await dbContext.Customers.FirstOrDefaultAsync(c => c.Id == conversation.CustomerId, cancellationToken);
        var connection = await dbContext.WhatsAppConnections
            .FirstOrDefaultAsync(c => c.BusinessId == message.BusinessId && c.Status == WhatsAppConnectionStatus.Active, cancellationToken);

        if (customer is null || connection is null)
        {
            message.NextAttemptAt = null; // can't retry without these — terminal
            await dbContext.SaveChangesAsync(cancellationToken);
            return;
        }

        await AttemptSendAsync(message, connection, customer.WhatsAppNumber, cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private async Task AttemptSendAsync(Message message, WhatsAppConnection connection, string toWaId, CancellationToken cancellationToken)
    {
        try
        {
            var result = await whatsAppSender.SendTextMessageAsync(connection.PhoneNumberId, connection.SystemUserToken, toWaId, message.Content, cancellationToken);
            message.WhatsAppMessageId = result.WhatsAppMessageId;
            message.Status = MessageDeliveryStatus.Sent;
            message.NextAttemptAt = null;
            message.LastError = null;
        }
        catch (Exception ex)
        {
            message.AttemptCount += 1;
            message.LastError = ex.Message;
            message.Status = MessageDeliveryStatus.Failed;
            message.NextAttemptAt = ComputeNextAttempt(message.AttemptCount, DateTimeOffset.UtcNow);
        }
    }

    // 3 scheduled retries (+2min, +10min, +30min) after attempts 1-3; a 4th failure gives up
    // (NextAttemptAt stays null — terminally failed, no more automatic retries).
    private static DateTimeOffset? ComputeNextAttempt(int attemptCount, DateTimeOffset now) => attemptCount switch
    {
        1 => now.AddMinutes(2),
        2 => now.AddMinutes(10),
        3 => now.AddMinutes(30),
        _ => null
    };

    private async Task<Conversation> GetOrCreateOpenConversationAsync(Guid businessId, Customer customer, CancellationToken cancellationToken)
    {
        var conversation = await dbContext.Conversations
            .FirstOrDefaultAsync(c => c.CustomerId == customer.Id && c.Status == ConversationStatus.Open, cancellationToken);
        if (conversation is not null)
        {
            return conversation;
        }

        conversation = new Conversation
        {
            Id = Guid.NewGuid(),
            BusinessId = businessId,
            CustomerId = customer.Id,
            WhatsAppThreadId = customer.WhatsAppNumber, // placeholder until real WhatsApp thread IDs exist
            Status = ConversationStatus.Open,
            CreatedAt = DateTimeOffset.UtcNow
        };
        dbContext.Conversations.Add(conversation);
        return conversation;
    }
}
