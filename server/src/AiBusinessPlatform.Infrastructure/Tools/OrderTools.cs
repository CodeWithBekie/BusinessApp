using System.Text.Json;
using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Tools;
using AiBusinessPlatform.Domain;
using AiBusinessPlatform.Domain.Entities;
using AiBusinessPlatform.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace AiBusinessPlatform.Infrastructure.Tools;

public class OrderTools(
    AiBusinessPlatformDbContext dbContext,
    ICurrentTenantProvider tenantProvider,
    ICatalogTools catalogTools) : IOrderTools
{
    public async Task<InvoiceResult> CreateInvoiceAsync(Guid businessId, Guid customerId, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        var order = await dbContext.Orders.FirstOrDefaultAsync(o => o.CustomerId == customerId && o.Status == OrderStatus.Quoted, cancellationToken)
            ?? throw new InvalidOperationException("No open (Quoted) order to invoice — nothing has been reserved yet.");

        var items = await dbContext.OrderItems.Where(oi => oi.OrderId == order.Id).ToListAsync(cancellationToken);
        if (items.Count == 0)
        {
            throw new InvalidOperationException("Order has no reserved items.");
        }

        order.TotalAmount = items.Sum(i => i.Subtotal);
        order.Status = OrderStatus.Invoiced;
        order.UpdatedAt = DateTimeOffset.UtcNow;

        var providerReference = $"INV-{order.Id:N}"[..12].ToUpperInvariant();

        var payment = new Payment
        {
            Id = Guid.NewGuid(),
            BusinessId = tenantProvider.CurrentBusinessId,
            OrderId = order.Id,
            Provider = PaymentProvider.Other,
            ProviderReference = providerReference,
            Amount = order.TotalAmount,
            Status = PaymentStatus.Pending,
            CreatedAt = DateTimeOffset.UtcNow
        };
        dbContext.Payments.Add(payment);

        await dbContext.SaveChangesAsync(cancellationToken);

        var catalogItemIds = items.Select(i => i.CatalogItemId).ToList();
        var catalogNames = await dbContext.CatalogItems
            .Where(c => catalogItemIds.Contains(c.Id))
            .ToDictionaryAsync(c => c.Id, c => c.Name, cancellationToken);

        var lineItems = items
            .Select(i => new InvoiceLineItem(i.CatalogItemId, catalogNames.GetValueOrDefault(i.CatalogItemId, "Unknown item"), i.Quantity, i.UnitPrice, i.Subtotal))
            .ToList();

        return new InvoiceResult(order.Id, order.TotalAmount, order.Currency, providerReference, lineItems);
    }

    public async Task<PaymentConfirmationResult> ConfirmPaymentAsync(Guid businessId, Guid orderId, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        var order = await dbContext.Orders.FirstOrDefaultAsync(o => o.Id == orderId, cancellationToken)
            ?? throw new InvalidOperationException($"Order {orderId} not found.");
        var payment = await dbContext.Payments.FirstOrDefaultAsync(p => p.OrderId == orderId, cancellationToken)
            ?? throw new InvalidOperationException($"Order {orderId} has no payment record.");

        // Idempotent — a re-delivered/duplicate webhook must not double-process (Section 9.3).
        if (payment.Status == PaymentStatus.Confirmed)
        {
            return new PaymentConfirmationResult(order.Id, payment.Id, order.Status, payment.Status);
        }

        if (order.Status != OrderStatus.Invoiced)
        {
            throw new InvalidOperationException($"Order {orderId} is not Invoiced (current status: {order.Status}).");
        }

        var orderItems = await dbContext.OrderItems.Where(oi => oi.OrderId == order.Id).ToListAsync(cancellationToken);
        foreach (var item in orderItems)
        {
            // Validation checkpoint only — stock was already decremented at reserve time.
            await catalogTools.FinalizeStockAsync(businessId, item.Id, cancellationToken);
        }

        var previousOrderStatus = order.Status;
        payment.Status = PaymentStatus.Confirmed;
        payment.ConfirmedAt = DateTimeOffset.UtcNow;
        order.Status = OrderStatus.Paid;
        order.UpdatedAt = DateTimeOffset.UtcNow;

        dbContext.AuditLogs.Add(new AuditLog
        {
            Id = Guid.NewGuid(),
            BusinessId = tenantProvider.CurrentBusinessId,
            ActorType = AuditActorType.System,
            ActorId = "PaymentWebhookConsumer",
            Action = "payment.confirmed",
            EntityType = nameof(Order),
            EntityId = order.Id.ToString(),
            BeforeStateJson = JsonSerializer.Serialize(new { Status = previousOrderStatus.ToString() }),
            AfterStateJson = JsonSerializer.Serialize(new { Status = order.Status.ToString() }),
            CreatedAt = DateTimeOffset.UtcNow
        });

        // Deterministic, templated receipt — never model-generated, since a financial
        // confirmation shouldn't be phrased by a non-deterministic LLM.
        var conversation = await dbContext.Conversations
            .FirstOrDefaultAsync(c => c.CustomerId == order.CustomerId && c.Status == ConversationStatus.Open, cancellationToken);
        if (conversation is not null)
        {
            dbContext.Messages.Add(new Message
            {
                Id = Guid.NewGuid(),
                BusinessId = tenantProvider.CurrentBusinessId,
                ConversationId = conversation.Id,
                Direction = MessageDirection.Outbound,
                Content = $"Receipt: Order {order.Id} paid — {order.TotalAmount} {order.Currency}. Thank you!",
                CreatedAt = DateTimeOffset.UtcNow
            });
        }

        await dbContext.SaveChangesAsync(cancellationToken);

        return new PaymentConfirmationResult(order.Id, payment.Id, order.Status, payment.Status);
    }
}
