using System.ComponentModel;
using AiBusinessPlatform.Domain;

namespace AiBusinessPlatform.Application.Tools;

// CatalogItemId set => restocking an existing item. Left null => ordering something not in the
// catalog yet; NewItemName/NewItemType are required in that case (NewItemUnit optional, defaults
// "each") and the item is created in the catalog once the purchase order is received (Part 2).
public record PurchaseOrderLineItem(
    Guid? CatalogItemId, string? NewItemName, CatalogItemType? NewItemType, string? NewItemUnit,
    int Quantity, decimal UnitCost);

public record PurchaseOrderItemSummary(
    Guid Id, Guid? CatalogItemId, string Name, bool IsNewItem, decimal? CurrentPrice, int Quantity, decimal UnitCost, decimal Subtotal);

public record PurchaseOrderSummary(
    Guid Id, Guid SupplierId, string SupplierName, PurchaseOrderStatus Status, decimal TotalAmount, decimal AmountPaid, decimal AmountOwed, string Currency,
    int ItemCount, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, DateTimeOffset? ReceivedAt);

public record PurchaseOrderDetail(
    Guid Id, Guid SupplierId, string SupplierName, PurchaseOrderStatus Status, decimal TotalAmount, decimal AmountPaid, decimal AmountOwed, string Currency,
    IReadOnlyList<PurchaseOrderItemSummary> Items, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, DateTimeOffset? ReceivedAt);

// One entry per PurchaseOrderItem being received. SalePrice is required when that line is a
// new item (there's no existing catalog price to fall back on) and optional for a restock line
// (omit/null to leave the catalog item's current price unchanged).
public record ReceivedLinePrice(Guid PurchaseOrderItemId, decimal? SalePrice);

// New ground, not a spec section — the "restocking from suppliers" side of inventory, mirroring
// the customer-facing order/POS model but in reverse (buying stock in, not selling it out). Shared
// by the dashboard REST endpoints and the MCP/Assistant tools (Section 10.2/10.7's "one function,
// multiple entry points").
public interface IPurchaseOrderTools
{
    [Description("Lists this business's purchase orders to suppliers, most recent first, optionally filtered to one status: \"Draft\", \"Ordered\", \"Received\", or \"Cancelled\".")]
    Task<IReadOnlyList<PurchaseOrderSummary>> ListPurchaseOrdersAsync(Guid businessId, PurchaseOrderStatus? status, CancellationToken cancellationToken = default);

    [Description("Gets full detail for one purchase order by its id: supplier, line items, and status.")]
    Task<PurchaseOrderDetail> GetPurchaseOrderAsync(Guid businessId, Guid purchaseOrderId, CancellationToken cancellationToken = default);

    [Description("Creates a purchase order to restock from a supplier: one or more line items with the quantity and unit cost being ordered. For each line, either set catalogItemId to restock an existing item (resolve it via list_catalog_items first — never guess an id), or leave catalogItemId null and supply newItemName + newItemType (\"Stock\", \"TimeBased\", or \"Quote\") to order a product that isn't in the catalog yet — it's added to the catalog once the order is received and a sale price is set. currency is only required when every line is a new item; otherwise it's inferred automatically and can be omitted. Does not change stock or the catalog yet — call receive_purchase_order once the goods actually arrive.")]
    Task<PurchaseOrderDetail> CreatePurchaseOrderAsync(Guid businessId, Guid supplierId, IReadOnlyList<PurchaseOrderLineItem> items, string? currency, CancellationToken cancellationToken = default);

    [Description("Marks a purchase order as received in full: transitions it to Received and increases stock for every line item all at once. Only an Ordered purchase order can be received. Only call this once the owner has clearly confirmed the goods have actually arrived. Pass linePrices to set/override the catalog sale price per line (by purchaseOrderItemId) — a sale price is REQUIRED for any line that orders a new (not-yet-in-catalog) item, since receiving is what actually creates it in the catalog; it's optional for a line that restocks an existing item (omit to leave its price unchanged).")]
    Task<PurchaseOrderDetail> ReceivePurchaseOrderAsync(Guid businessId, Guid purchaseOrderId, IReadOnlyList<ReceivedLinePrice>? linePrices, CancellationToken cancellationToken = default);

    [Description("Records a cash payment made to the supplier against a purchase order's outstanding balance. provider must be \"Cash\", \"EcoCash\", \"Bank\", or \"Other\". amount must be greater than zero and cannot exceed the order's current amount owed (total minus what's already been paid).")]
    Task<PurchaseOrderDetail> RecordSupplierPaymentAsync(Guid businessId, Guid purchaseOrderId, decimal amount, PaymentProvider provider, CancellationToken cancellationToken = default);
}
