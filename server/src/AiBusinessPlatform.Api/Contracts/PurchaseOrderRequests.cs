using AiBusinessPlatform.Domain;

namespace AiBusinessPlatform.Api.Contracts;

public record PurchaseOrderLineItemRequest(
    Guid? CatalogItemId, string? NewItemName, CatalogItemType? NewItemType, string? NewItemUnit,
    int Quantity, decimal UnitCost);

public record CreatePurchaseOrderRequest(Guid SupplierId, IReadOnlyList<PurchaseOrderLineItemRequest> Items, string? Currency);

public record ReceivedLinePriceRequest(Guid PurchaseOrderItemId, decimal? SalePrice);

public record ReceivePurchaseOrderRequest(IReadOnlyList<ReceivedLinePriceRequest>? LinePrices);
