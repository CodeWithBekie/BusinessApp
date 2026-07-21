using System.ComponentModel;

namespace AiBusinessPlatform.Application.Tools;

public record DeliveryAssignmentResult(Guid DeliveryId, string? DriverName);

public record DeliveryStatusResult(Guid OrderId, string Status);

// Section 10.3/12.4 — Phase 1 feature (delivery automation); Phase 0 only wires the contract.
public interface IDeliveryTools
{
    [Description("Assigns a driver to fulfil an order's delivery.")]
    Task<DeliveryAssignmentResult> AssignDriverAsync(Guid businessId, Guid orderId, CancellationToken cancellationToken = default);

    [Description("Gets the current delivery status for an order.")]
    Task<DeliveryStatusResult> GetDeliveryStatusAsync(Guid orderId, CancellationToken cancellationToken = default);
}
