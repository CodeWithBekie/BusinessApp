using System.ComponentModel;

namespace AiBusinessPlatform.Application.Tools;

public record CatalogAvailabilityMatch(Guid CatalogItemId, string Name, decimal Price, string Currency, int? StockQuantity);

// Success/Reason let the model read an explicit typed failure (FR12: inform the customer honestly
// rather than guessing) instead of relying on how the installed function-invocation middleware
// surfaces a thrown exception.
public record ReserveStockResult(Guid ReservationId, bool Success, string? Reason);

// Section 10.3/12.4. Reservation model (no dedicated schema table — see product-spec-v1.3 Section
// 11/23): "reserve" decrements CatalogItem.StockQuantity immediately and creates/updates an Order
// (Quoted) + OrderItem; "release" restores stock and removes the line; "finalize" is a validation
// checkpoint only (stock was already decremented at reserve time). OrderItem.Id doubles as the
// ReservationId.
public interface ICatalogTools
{
    [Description("Finds catalog items matching a free-text query and returns price/stock availability.")]
    Task<IReadOnlyList<CatalogAvailabilityMatch>> CheckAvailabilityAsync(Guid businessId, string itemQuery, CancellationToken cancellationToken = default);

    [Description("Reserves a quantity of a catalog item ahead of payment confirmation.")]
    Task<ReserveStockResult> ReserveStockAsync(Guid businessId, Guid customerId, Guid itemId, int quantity, CancellationToken cancellationToken = default);

    [Description("Finalizes a stock reservation after payment is confirmed, decrementing stock permanently.")]
    Task FinalizeStockAsync(Guid businessId, Guid reservationId, CancellationToken cancellationToken = default);

    // Takes an item-name query rather than a reservationId — the model has no reliable way to
    // recall an opaque reservation GUID across separate conversation turns (only plain-text reply
    // content is persisted and reloaded into history, not structured tool-call/result data), so
    // this resolves the matching line item on the customer's open order server-side instead,
    // mirroring how ReserveStockAsync already resolves "the customer's order" without needing an
    // orderId from the model.
    [Description("Cancels a previously reserved item on the customer's current order by name (e.g. \"cement\"), restoring its stock, without decrementing anything (e.g. the customer changed their mind before paying).")]
    Task<ReserveStockResult> ReleaseStockAsync(Guid businessId, Guid customerId, string itemQuery, CancellationToken cancellationToken = default);
}
