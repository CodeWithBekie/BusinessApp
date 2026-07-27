using AiBusinessPlatform.Api.Contracts;
using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Tools;
using AiBusinessPlatform.Domain;
using AiBusinessPlatform.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace AiBusinessPlatform.Api.Endpoints;

// Customer-facing marketplace — a distinct route group from DashboardEndpoints' /api group, which
// blanket-requires a business-owner JWT. This group has NO blanket RequireAuthorization() since
// browsing (business directory + a business's catalog) must stay anonymous; auth is applied
// per-route instead, only on the two routes that actually need a customer identity.
public static class MarketplaceEndpoints
{
    public static void MapMarketplaceEndpoints(this WebApplication app)
    {
        var marketplace = app.MapGroup("/api/marketplace");

        marketplace.MapGet("/businesses", async (IMarketplaceTools marketplaceTools, CancellationToken ct) =>
            Results.Ok(await marketplaceTools.ListPubliclyListedBusinessesAsync(ct)));

        // Anonymous — lets the storefront preview an accurate VAT-inclusive total before checkout.
        // Same visibility rule as the list above (IgnoreQueryFilters not needed: Business isn't
        // ITenantScoped, so there's no ambient filter to bypass here regardless of caller identity).
        marketplace.MapGet("/businesses/{businessId:guid}", async (
            Guid businessId, AiBusinessPlatformDbContext db, CancellationToken ct) =>
        {
            var business = await db.Businesses.AsNoTracking()
                .Where(b => b.Id == businessId && b.IsPubliclyListed && b.Status == BusinessStatus.Active)
                .Select(b => new PublicBusinessSummary(b.Id, b.Name, b.IndustryType, b.Currency, b.VatRate))
                .FirstOrDefaultAsync(ct);

            return business is null ? Results.NotFound() : Results.Ok(business);
        });

        marketplace.MapGet("/businesses/{businessId:guid}/catalog", async (
            Guid businessId, IMarketplaceTools marketplaceTools, ICurrentTenantSetter tenantSetter, CancellationToken ct) =>
        {
            tenantSetter.SetBusinessId(businessId);
            return Results.Ok(await marketplaceTools.BrowseCatalogAsync(businessId, ct));
        });

        marketplace.MapPost("/businesses/{businessId:guid}/orders", async (
            Guid businessId, PlaceMarketplaceOrderRequest request, IMarketplaceTools marketplaceTools,
            ICurrentCustomerProvider customerProvider, ICurrentTenantSetter tenantSetter, CancellationToken ct) =>
        {
            var customerAccountId = customerProvider.CurrentCustomerAccountId;
            if (customerAccountId is null)
            {
                return Results.Forbid();
            }
            if (request.Items.Count == 0)
            {
                return Results.BadRequest("At least one item is required.");
            }

            tenantSetter.SetBusinessId(businessId);
            var items = request.Items.Select(i => new PosSaleLineItem(i.CatalogItemId, i.Quantity)).ToList();

            try
            {
                var result = await marketplaceTools.PlaceOrderAsync(businessId, customerAccountId.Value, items, ct);
                return Results.Ok(result);
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        }).RequireAuthorization("CustomerOnly");

        marketplace.MapGet("/my-orders", async (
            IMarketplaceTools marketplaceTools, ICurrentCustomerProvider customerProvider, CancellationToken ct) =>
        {
            var customerAccountId = customerProvider.CurrentCustomerAccountId;
            if (customerAccountId is null)
            {
                return Results.Forbid();
            }

            return Results.Ok(await marketplaceTools.ListMyOrdersAsync(customerAccountId.Value, ct));
        }).RequireAuthorization("CustomerOnly");
    }
}
