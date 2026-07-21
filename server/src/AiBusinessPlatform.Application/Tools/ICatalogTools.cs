using System.ComponentModel;

namespace AiBusinessPlatform.Application.Tools;

public record CatalogAvailabilityMatch(Guid CatalogItemId, string Name, decimal Price, string Currency, int? StockQuantity);

public record ReserveStockResult(Guid ReservationId);

// Section 10.3/12.4 — implementations are Phase 1+ (real orchestrator logic). Phase 0 only
// wires the contracts and DI registration so Api/Mcp can reference a stable interface.
public interface ICatalogTools
{
    [Description("Finds catalog items matching a free-text query and returns price/stock availability.")]
    Task<IReadOnlyList<CatalogAvailabilityMatch>> CheckAvailabilityAsync(Guid businessId, string itemQuery, CancellationToken cancellationToken = default);

    [Description("Reserves a quantity of a catalog item ahead of payment confirmation.")]
    Task<ReserveStockResult> ReserveStockAsync(Guid businessId, Guid itemId, int quantity, CancellationToken cancellationToken = default);

    [Description("Finalizes a stock reservation after payment is confirmed, decrementing stock permanently.")]
    Task FinalizeStockAsync(Guid reservationId, CancellationToken cancellationToken = default);

    [Description("Releases a stock reservation without decrementing stock (e.g. payment failed or expired).")]
    Task ReleaseStockAsync(Guid reservationId, CancellationToken cancellationToken = default);
}
