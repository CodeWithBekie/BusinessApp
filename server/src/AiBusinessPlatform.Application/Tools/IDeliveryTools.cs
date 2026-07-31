using System.ComponentModel;
using AiBusinessPlatform.Domain;

namespace AiBusinessPlatform.Application.Tools;

public record DeliveryAssignmentResult(Guid DeliveryId, string? DriverName, DeliveryStatus Status);

public record DeliveryStatusResult(Guid OrderId, DeliveryStatus Status, string? DriverName);

// Section 10.3/12.4 — delivery tracking / driver assignment. AssignDriverAsync/GetDeliveryStatusAsync
// match the two functions the spec names; UpdateDeliveryStatusAsync is an addition beyond the literal
// spec list — without it a delivery could never progress past Assigned to InTransit/Delivered, since
// DeliveryStatus has 4 states but the spec only describes assigning and reading.
public interface IDeliveryTools
{
    [Description("Assigns (or reassigns) a driver to fulfil an order's delivery. Only valid once the order is Paid or Fulfilled. driverName is optional (a delivery can be tracked without naming a specific driver yet).")]
    Task<DeliveryAssignmentResult> AssignDriverAsync(Guid businessId, Guid orderId, string? driverName, CancellationToken cancellationToken = default);

    [Description("Progresses an order's delivery status (Pending, Assigned, InTransit, or Delivered). Creates the delivery record if one doesn't exist yet. Fails if the delivery is already Delivered (terminal).")]
    Task<DeliveryStatusResult> UpdateDeliveryStatusAsync(Guid businessId, Guid orderId, DeliveryStatus status, CancellationToken cancellationToken = default);

    [Description("Gets the current delivery status and assigned driver (if any) for an order. Returns Pending with no driver if no delivery has been assigned yet.")]
    Task<DeliveryStatusResult> GetDeliveryStatusAsync(Guid businessId, Guid orderId, CancellationToken cancellationToken = default);
}
