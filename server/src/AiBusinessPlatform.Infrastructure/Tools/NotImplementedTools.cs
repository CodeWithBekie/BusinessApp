using AiBusinessPlatform.Application.Tools;

namespace AiBusinessPlatform.Infrastructure.Tools;

// Phase 0 stubs: interfaces + DI wiring exist so Api/Mcp can reference a stable contract now,
// but real business logic (Section 10.3) is out of scope until Phase 1+. Each method names the
// doc section it implements, so it's easy to find when the time comes.
// (CatalogTools has its own real implementation now — see Tools/CatalogTools.cs.)

public class PaymentTools : IPaymentTools
{
    public Task<PaymentRequestResult> CreatePaymentRequestAsync(Guid businessId, Guid orderId, decimal amount, string currency, string customerNumber, CancellationToken cancellationToken = default)
        => throw new NotImplementedException("CreatePaymentRequest — see product-spec-v1.3 Section 13.2, Phase 1");

    public Task<PaymentStatusResult> GetPaymentStatusAsync(string paymentReference, CancellationToken cancellationToken = default)
        => throw new NotImplementedException("GetPaymentStatus — see product-spec-v1.3 Section 13.2, Phase 1");
}

public class DeliveryTools : IDeliveryTools
{
    public Task<DeliveryAssignmentResult> AssignDriverAsync(Guid businessId, Guid orderId, CancellationToken cancellationToken = default)
        => throw new NotImplementedException("AssignDriver — see product-spec-v1.3 Section 4 Phase 1 (delivery automation)");

    public Task<DeliveryStatusResult> GetDeliveryStatusAsync(Guid orderId, CancellationToken cancellationToken = default)
        => throw new NotImplementedException("GetDeliveryStatus — see product-spec-v1.3 Section 4 Phase 1 (delivery automation)");
}

public class ApprovalTools : IApprovalTools
{
    public Task<RequestApprovalResult> RequestApprovalAsync(Guid businessId, string actionType, string detailsJson, CancellationToken cancellationToken = default)
        => throw new NotImplementedException("RequestApproval — see product-spec-v1.3 Section 10.5, Phase 1");

    public Task<ApprovalStatusResult> GetApprovalStatusAsync(Guid pendingApprovalId, CancellationToken cancellationToken = default)
        => throw new NotImplementedException("GetApprovalStatus — see product-spec-v1.3 Section 10.5, Phase 1");
}

public class RagTools : IRagTools
{
    public Task<IReadOnlyList<RetrievedDocumentChunk>> RetrieveRelevantDocumentsAsync(Guid businessId, string query, CancellationToken cancellationToken = default)
        => throw new NotImplementedException("RetrieveRelevantDocuments — see product-spec-v1.3 Section 10.6, Phase 2");
}
