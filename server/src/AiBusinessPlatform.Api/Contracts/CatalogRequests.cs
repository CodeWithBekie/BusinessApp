using AiBusinessPlatform.Domain;

namespace AiBusinessPlatform.Api.Contracts;

public record CreateCatalogItemRequest(
    string Name,
    CatalogItemType ItemType,
    decimal Price,
    string? Currency,
    int? StockQuantity,
    string? Unit,
    string? Code);

// PATCH semantics — every field is optional; only supplied fields are changed. ItemType is
// deliberately not patchable (switching Stock <-> TimeBased/Quote after items/reservations exist
// against it is out of scope — create a new item instead).
public record UpdateCatalogItemRequest(
    string? Name,
    decimal? Price,
    string? Currency,
    int? StockQuantity,
    string? Unit,
    bool? Active,
    string? Code);
