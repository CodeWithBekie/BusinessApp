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

        // Addressed as /orders/{orderId} (not nested under /businesses/{businessId}) so every
        // handler below is forced through IMarketplaceTools' own server-side ownership check
        // rather than trusting a client-supplied businessId.
        marketplace.MapGet("/orders/{orderId:guid}", async (
            Guid orderId, IMarketplaceTools marketplaceTools, ICurrentCustomerProvider customerProvider, CancellationToken ct) =>
        {
            var customerAccountId = customerProvider.CurrentCustomerAccountId;
            if (customerAccountId is null)
            {
                return Results.Forbid();
            }

            try
            {
                return Results.Ok(await marketplaceTools.GetMyOrderAsync(orderId, customerAccountId.Value, ct));
            }
            catch (KeyNotFoundException)
            {
                return Results.NotFound();
            }
        }).RequireAuthorization("CustomerOnly");

        marketplace.MapPost("/orders/{orderId:guid}/cancel", async (
            Guid orderId, IMarketplaceTools marketplaceTools, ICurrentCustomerProvider customerProvider, CancellationToken ct) =>
        {
            var customerAccountId = customerProvider.CurrentCustomerAccountId;
            if (customerAccountId is null)
            {
                return Results.Forbid();
            }

            try
            {
                return Results.Ok(await marketplaceTools.CancelMyOrderAsync(orderId, customerAccountId.Value, ct));
            }
            catch (KeyNotFoundException)
            {
                return Results.NotFound();
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        }).RequireAuthorization("CustomerOnly");

        marketplace.MapPost("/orders/{orderId:guid}/request-cancellation", async (
            Guid orderId, RequestCancellationRequest request, IMarketplaceTools marketplaceTools,
            ICurrentCustomerProvider customerProvider, CancellationToken ct) =>
        {
            var customerAccountId = customerProvider.CurrentCustomerAccountId;
            if (customerAccountId is null)
            {
                return Results.Forbid();
            }

            try
            {
                return Results.Ok(await marketplaceTools.RequestMyOrderCancellationAsync(orderId, customerAccountId.Value, request.Reason, ct));
            }
            catch (KeyNotFoundException)
            {
                return Results.NotFound();
            }
        }).RequireAuthorization("CustomerOnly");

        marketplace.MapPost("/orders/{orderId:guid}/pay/ecocash", async (
            Guid orderId, PayEcoCashRequest request, IMarketplaceTools marketplaceTools,
            ICurrentCustomerProvider customerProvider, CancellationToken ct) =>
        {
            var customerAccountId = customerProvider.CurrentCustomerAccountId;
            if (customerAccountId is null)
            {
                return Results.Forbid();
            }
            if (string.IsNullOrWhiteSpace(request.PhoneNumber))
            {
                return Results.BadRequest("phoneNumber is required.");
            }

            try
            {
                return Results.Ok(await marketplaceTools.PayWithEcoCashAsync(orderId, customerAccountId.Value, request.PhoneNumber.Trim(), ct));
            }
            catch (KeyNotFoundException)
            {
                return Results.NotFound();
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        }).RequireAuthorization("CustomerOnly");

        var allowedProofContentTypes = new HashSet<string> { "image/jpeg", "image/png", "image/webp" };
        const long maxProofBytes = 5 * 1024 * 1024;

        marketplace.MapPut("/orders/{orderId:guid}/payment-proof", async (
            Guid orderId, IFormFile file, IMarketplaceTools marketplaceTools, ICurrentCustomerProvider customerProvider, CancellationToken ct) =>
        {
            var customerAccountId = customerProvider.CurrentCustomerAccountId;
            if (customerAccountId is null)
            {
                return Results.Forbid();
            }
            if (file.Length == 0)
            {
                return Results.BadRequest("A file is required.");
            }
            if (file.Length > maxProofBytes)
            {
                return Results.BadRequest("Image must be 5MB or smaller.");
            }
            if (!allowedProofContentTypes.Contains(file.ContentType))
            {
                return Results.BadRequest("Image must be JPEG, PNG, or WebP.");
            }

            using var stream = new MemoryStream();
            await file.CopyToAsync(stream, ct);

            try
            {
                await marketplaceTools.SubmitPaymentProofAsync(orderId, customerAccountId.Value, stream.ToArray(), file.ContentType, ct);
                return Results.Ok();
            }
            catch (KeyNotFoundException)
            {
                return Results.NotFound();
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        }).RequireAuthorization("CustomerOnly").DisableAntiforgery();
    }
}
