using AiBusinessPlatform.Domain;

namespace AiBusinessPlatform.Api.Contracts;

public record PosSaleLineItemRequest(Guid CatalogItemId, int Quantity);

public record PosSaleRequest(IReadOnlyList<PosSaleLineItemRequest> Items, string PaymentMethod, Guid? CustomerId, string? CustomerWhatsAppNumber, string? CustomerName, decimal? AmountTendered);

public record QuotationRequest(IReadOnlyList<PosSaleLineItemRequest> Items, Guid? CustomerId, string? CustomerWhatsAppNumber, string? CustomerName);

public record RecordPaymentRequest(PaymentProvider Provider, string Reference, decimal Amount);

public record UpdatePaymentProviderRequest(PaymentProvider Provider);

public record PayOrderWithEcoCashRequest(string PhoneNumber);

public record AssignDriverRequest(string? DriverName);

public record UpdateDeliveryStatusRequest(DeliveryStatus Status);
