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
    ICatalogTools catalogTools,
    IApprovalTools approvalTools) : IOrderTools
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
        await SendCustomerMessageAsync(order.CustomerId, $"Receipt: Order {order.Id} paid — {order.TotalAmount} {order.Currency}. Thank you!", cancellationToken);

        await dbContext.SaveChangesAsync(cancellationToken);

        return new PaymentConfirmationResult(order.Id, payment.Id, order.Status, payment.Status);
    }

    public async Task<OrderCancellationRequestResult> RequestOrderCancellationApprovalAsync(Guid businessId, Guid customerId, string reason, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        // Phase 0 simplification: picks the customer's most recent Paid order — a customer with
        // more than one Paid order can only request cancellation of the latest this way.
        var order = await dbContext.Orders
            .Where(o => o.CustomerId == customerId && o.Status == OrderStatus.Paid)
            .OrderByDescending(o => o.UpdatedAt)
            .FirstOrDefaultAsync(cancellationToken);

        if (order is null)
        {
            return new OrderCancellationRequestResult(false, null, null, null, null, "No paid order found to cancel.");
        }

        var details = new CancelPaidOrderDetails(order.Id, customerId, order.TotalAmount, order.Currency, reason, DateTimeOffset.UtcNow);
        var approval = await approvalTools.RequestApprovalAsync(businessId, ApprovalActionTypes.CancelPaidOrder, JsonSerializer.Serialize(details), cancellationToken);

        return new OrderCancellationRequestResult(true, approval.PendingApprovalId, order.Id, order.TotalAmount, order.Currency, null);
    }

    public async Task<OrderCancellationResult> CancelPaidOrderAsync(Guid businessId, Guid orderId, Guid? decidedBy, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        var order = await dbContext.Orders.FirstOrDefaultAsync(o => o.Id == orderId, cancellationToken)
            ?? throw new InvalidOperationException($"Order {orderId} not found.");

        // Idempotent — a retried decision-endpoint call must not re-cancel/re-notify.
        if (order.Status == OrderStatus.Cancelled)
        {
            return new OrderCancellationResult(order.Id, order.Status);
        }

        if (order.Status != OrderStatus.Paid)
        {
            throw new InvalidOperationException($"Order {orderId} is not Paid (current status: {order.Status}) — cannot approve a cancellation for it.");
        }

        var orderItems = await dbContext.OrderItems.Where(oi => oi.OrderId == order.Id).ToListAsync(cancellationToken);
        var catalogItemIds = orderItems.Select(oi => oi.CatalogItemId).ToList();
        var catalogItems = await dbContext.CatalogItems
            .Where(c => catalogItemIds.Contains(c.Id))
            .ToDictionaryAsync(c => c.Id, cancellationToken);

        foreach (var item in orderItems)
        {
            if (catalogItems.TryGetValue(item.CatalogItemId, out var catalogItem) && catalogItem.StockQuantity is not null)
            {
                catalogItem.StockQuantity += item.Quantity;
                catalogItem.UpdatedAt = DateTimeOffset.UtcNow;
            }
        }

        var previousStatus = order.Status;
        order.Status = OrderStatus.Cancelled;
        order.UpdatedAt = DateTimeOffset.UtcNow;

        dbContext.AuditLogs.Add(new AuditLog
        {
            Id = Guid.NewGuid(),
            BusinessId = tenantProvider.CurrentBusinessId,
            ActorType = AuditActorType.User,
            ActorId = decidedBy?.ToString() ?? "unknown-dev-decision",
            Action = "order.cancellation.approved",
            EntityType = nameof(Order),
            EntityId = order.Id.ToString(),
            BeforeStateJson = JsonSerializer.Serialize(new { Status = previousStatus.ToString() }),
            AfterStateJson = JsonSerializer.Serialize(new { Status = order.Status.ToString() }),
            CreatedAt = DateTimeOffset.UtcNow
        });

        await SendCustomerMessageAsync(order.CustomerId, $"Your order {order.Id} has been cancelled per your request and a refund will be arranged. We're sorry for the inconvenience.", cancellationToken);

        await dbContext.SaveChangesAsync(cancellationToken);
        return new OrderCancellationResult(order.Id, order.Status);
    }

    public async Task NotifyOrderCancellationRejectedAsync(Guid businessId, Guid orderId, Guid? decidedBy, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        var order = await dbContext.Orders.FirstOrDefaultAsync(o => o.Id == orderId, cancellationToken)
            ?? throw new InvalidOperationException($"Order {orderId} not found.");

        dbContext.AuditLogs.Add(new AuditLog
        {
            Id = Guid.NewGuid(),
            BusinessId = tenantProvider.CurrentBusinessId,
            ActorType = AuditActorType.User,
            ActorId = decidedBy?.ToString() ?? "unknown-dev-decision",
            Action = "order.cancellation.rejected",
            EntityType = nameof(Order),
            EntityId = order.Id.ToString(),
            BeforeStateJson = JsonSerializer.Serialize(new { Status = order.Status.ToString() }),
            AfterStateJson = JsonSerializer.Serialize(new { Status = order.Status.ToString() }),
            CreatedAt = DateTimeOffset.UtcNow
        });

        await SendCustomerMessageAsync(order.CustomerId, $"We're sorry, your request to cancel/refund order {order.Id} was not approved. Please contact us if you have questions.", cancellationToken);

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    // Shared "find open conversation, add outbound Message" logic — used by ConfirmPaymentAsync's
    // receipt and both cancellation-outcome messages above. Deterministic/templated by design:
    // financial and status-changing confirmations should never be model-generated.
    private async Task SendCustomerMessageAsync(Guid customerId, string content, CancellationToken cancellationToken)
    {
        var conversation = await dbContext.Conversations
            .FirstOrDefaultAsync(c => c.CustomerId == customerId && c.Status == ConversationStatus.Open, cancellationToken);
        if (conversation is not null)
        {
            dbContext.Messages.Add(new Message
            {
                Id = Guid.NewGuid(),
                BusinessId = tenantProvider.CurrentBusinessId,
                ConversationId = conversation.Id,
                Direction = MessageDirection.Outbound,
                Content = content,
                CreatedAt = DateTimeOffset.UtcNow
            });
        }
    }
}
