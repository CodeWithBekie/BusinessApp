using AiBusinessPlatform.Application.Tools;

namespace AiBusinessPlatform.Infrastructure.Tools;

// Phase 0 stubs: interfaces + DI wiring exist so Api/Mcp can reference a stable contract now,
// but real business logic (Section 10.3) is out of scope until Phase 1+. Each method names the
// doc section it implements, so it's easy to find when the time comes.
// (CatalogTools, OrderTools, ApprovalTools, RagTools, and PaymentTools have their own real
// implementations now — see Tools/CatalogTools.cs, Tools/OrderTools.cs, Tools/ApprovalTools.cs,
// Tools/RagTools.cs, Tools/PaymentTools.cs.)

public class DeliveryTools : IDeliveryTools
{
    public Task<DeliveryAssignmentResult> AssignDriverAsync(Guid businessId, Guid orderId, CancellationToken cancellationToken = default)
        => throw new NotImplementedException("AssignDriver — see product-spec-v1.3 Section 4 Phase 1 (delivery automation)");

    public Task<DeliveryStatusResult> GetDeliveryStatusAsync(Guid orderId, CancellationToken cancellationToken = default)
        => throw new NotImplementedException("GetDeliveryStatus — see product-spec-v1.3 Section 4 Phase 1 (delivery automation)");
}
