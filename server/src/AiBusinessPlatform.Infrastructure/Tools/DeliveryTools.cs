using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Tools;
using AiBusinessPlatform.Domain;
using AiBusinessPlatform.Domain.Entities;
using AiBusinessPlatform.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace AiBusinessPlatform.Infrastructure.Tools;

// Section 10.3/12.4 — delivery tracking / driver assignment. Delivery is deliberately independent
// side-tracking info for an order, not a gate on OrderStatus: MarkOrderFulfilledAsync's Paid ->
// Fulfilled transition is untouched by this file, matching the spec's own data model (Section 11),
// which has no FK-enforced relationship between Orders and Deliveries beyond Delivery.OrderId.
public class DeliveryTools(AiBusinessPlatformDbContext dbContext, ICurrentTenantProvider tenantProvider) : IDeliveryTools
{
    public async Task<DeliveryAssignmentResult> AssignDriverAsync(Guid businessId, Guid orderId, string? driverName, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        var order = await dbContext.Orders.FirstOrDefaultAsync(o => o.Id == orderId && o.BusinessId == businessId, cancellationToken)
            ?? throw new KeyNotFoundException($"Order {orderId} not found.");

        if (order.Status is not (OrderStatus.Paid or OrderStatus.Fulfilled))
        {
            throw new InvalidOperationException("A driver can only be assigned once the order is Paid.");
        }

        var delivery = await dbContext.Deliveries.FirstOrDefaultAsync(d => d.OrderId == orderId, cancellationToken);
        if (delivery is null)
        {
            delivery = new Delivery { Id = Guid.NewGuid(), BusinessId = businessId, OrderId = orderId, CreatedAt = DateTimeOffset.UtcNow };
            dbContext.Deliveries.Add(delivery);
        }

        delivery.DriverName = driverName;
        if (delivery.Status == DeliveryStatus.Pending)
        {
            delivery.Status = DeliveryStatus.Assigned;
        }
        delivery.UpdatedAt = DateTimeOffset.UtcNow;

        await dbContext.SaveChangesAsync(cancellationToken);

        return new DeliveryAssignmentResult(delivery.Id, delivery.DriverName, delivery.Status);
    }

    public async Task<DeliveryStatusResult> UpdateDeliveryStatusAsync(Guid businessId, Guid orderId, DeliveryStatus status, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        var delivery = await dbContext.Deliveries.FirstOrDefaultAsync(d => d.OrderId == orderId, cancellationToken);
        if (delivery is null)
        {
            // Auto-create rather than requiring AssignDriverAsync first — lets an owner jump
            // straight to "mark delivered" (FR18) without a mandatory driver-assignment step.
            var order = await dbContext.Orders.FirstOrDefaultAsync(o => o.Id == orderId && o.BusinessId == businessId, cancellationToken)
                ?? throw new KeyNotFoundException($"Order {orderId} not found.");
            delivery = new Delivery { Id = Guid.NewGuid(), BusinessId = businessId, OrderId = orderId, CreatedAt = DateTimeOffset.UtcNow };
            dbContext.Deliveries.Add(delivery);
        }

        if (delivery.Status == DeliveryStatus.Delivered)
        {
            throw new InvalidOperationException("This order has already been marked delivered.");
        }

        delivery.Status = status;
        delivery.UpdatedAt = DateTimeOffset.UtcNow;

        await dbContext.SaveChangesAsync(cancellationToken);

        return new DeliveryStatusResult(orderId, delivery.Status, delivery.DriverName);
    }

    public async Task<DeliveryStatusResult> GetDeliveryStatusAsync(Guid businessId, Guid orderId, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        var delivery = await dbContext.Deliveries.AsNoTracking().FirstOrDefaultAsync(d => d.OrderId == orderId, cancellationToken);

        return new DeliveryStatusResult(orderId, delivery?.Status ?? DeliveryStatus.Pending, delivery?.DriverName);
    }
}
