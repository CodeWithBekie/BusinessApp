using AiBusinessPlatform.Domain;

namespace AiBusinessPlatform.Application.Tools;

public record PublicBusinessSummary(Guid Id, string Name, string IndustryType, string Currency);

public record MarketplaceOrderResult(
    Guid OrderId, Guid BusinessId, string BusinessName, decimal TotalAmount, string Currency,
    string PaymentReference, string? PaymentInstructions, IReadOnlyList<InvoiceLineItem> LineItems);

public record MarketplaceOrderSummary(
    Guid OrderId, Guid BusinessId, string BusinessName, OrderStatus Status,
    decimal TotalAmount, string Currency, int ItemCount, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);

// Customer-facing marketplace capabilities — kept separate from ICatalogTools/IOrderTools (which
// stay business-owner/staff-facing) rather than bloating those interfaces further. Not exposed to
// the AI assistant/MCP; these are REST-only (MarketplaceEndpoints.cs).
public interface IMarketplaceTools
{
    Task<IReadOnlyList<PublicBusinessSummary>> ListPubliclyListedBusinessesAsync(CancellationToken cancellationToken = default);

    // Caller must have already called ICurrentTenantSetter.SetBusinessId(businessId) — this thinly
    // wraps ICatalogTools.ListCatalogItemsAsync(businessId, activeOnly: true, ...).
    Task<IReadOnlyList<CatalogItemSummary>> BrowseCatalogAsync(Guid businessId, CancellationToken cancellationToken = default);

    // Composes CreateQuotationAsync + CreateInvoiceAsync back-to-back — "order then pay" as one
    // motion for a self-checkout customer, unlike staff who may want to review before invoicing.
    Task<MarketplaceOrderResult> PlaceOrderAsync(
        Guid businessId, Guid customerAccountId, IReadOnlyList<PosSaleLineItem> items, CancellationToken cancellationToken = default);

    // The one genuinely cross-tenant read in this feature — a customer's orders across every
    // business they've bought from, not scoped to one ambient tenant.
    Task<IReadOnlyList<MarketplaceOrderSummary>> ListMyOrdersAsync(Guid customerAccountId, CancellationToken cancellationToken = default);
}
