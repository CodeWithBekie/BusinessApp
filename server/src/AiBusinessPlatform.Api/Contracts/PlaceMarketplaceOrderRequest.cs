namespace AiBusinessPlatform.Api.Contracts;

public record PlaceMarketplaceOrderRequest(IReadOnlyList<PosSaleLineItemRequest> Items);
