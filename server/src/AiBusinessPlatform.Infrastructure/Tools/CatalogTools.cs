using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Tools;
using AiBusinessPlatform.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace AiBusinessPlatform.Infrastructure.Tools;

public class CatalogTools(AiBusinessPlatformDbContext dbContext, ICurrentTenantProvider tenantProvider) : ICatalogTools
{
    public async Task<IReadOnlyList<CatalogAvailabilityMatch>> CheckAvailabilityAsync(Guid businessId, string itemQuery, CancellationToken cancellationToken = default)
    {
        // The DbContext's global query filter already scopes CatalogItems to the ambient tenant
        // (Section 11); this check catches a caller ever passing a mismatched businessId instead
        // of silently trusting or silently ignoring it (Section 11/14's isolation guarantee should
        // fail loud, not fail quiet).
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        var trimmedQuery = itemQuery.Trim();

        var items = await dbContext.CatalogItems
            .Where(i => i.Active && EF.Functions.ILike(i.Name, $"%{trimmedQuery}%"))
            .ToListAsync(cancellationToken);

        return items
            .Select(i => new CatalogAvailabilityMatch(i.Id, i.Name, i.Price, i.Currency, i.StockQuantity))
            .ToList();
    }

    public Task<ReserveStockResult> ReserveStockAsync(Guid businessId, Guid itemId, int quantity, CancellationToken cancellationToken = default)
        => throw new NotImplementedException("ReserveStock — see product-spec-v1.3 Section 10.3, follow-up pass (no reservation concept in the schema yet)");

    public Task FinalizeStockAsync(Guid reservationId, CancellationToken cancellationToken = default)
        => throw new NotImplementedException("FinalizeStock — see product-spec-v1.3 Section 10.3, follow-up pass");

    public Task ReleaseStockAsync(Guid reservationId, CancellationToken cancellationToken = default)
        => throw new NotImplementedException("ReleaseStock — see product-spec-v1.3 Section 10.3, follow-up pass");
}
