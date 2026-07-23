using AiBusinessPlatform.Domain;

namespace AiBusinessPlatform.Api.Contracts;

public record OrderListItemResponse(
    Guid Id,
    Guid CustomerId,
    string CustomerWhatsAppNumber,
    string? CustomerName,
    OrderStatus Status,
    decimal TotalAmount,
    string Currency,
    int ItemCount,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public record OrderLineItemResponse(
    Guid CatalogItemId,
    string Name,
    int Quantity,
    decimal UnitPrice,
    decimal Subtotal);

public record OrderPaymentResponse(
    PaymentProvider Provider,
    string ProviderReference,
    PaymentStatus Status,
    decimal Amount,
    DateTimeOffset? ConfirmedAt);

public record OrderDetailResponse(
    Guid Id,
    Guid CustomerId,
    string CustomerWhatsAppNumber,
    string? CustomerName,
    OrderStatus Status,
    decimal TotalAmount,
    string Currency,
    IReadOnlyList<OrderLineItemResponse> Items,
    OrderPaymentResponse? Payment,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);
