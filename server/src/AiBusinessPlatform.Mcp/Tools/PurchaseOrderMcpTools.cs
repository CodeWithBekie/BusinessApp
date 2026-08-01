using System.ComponentModel;
using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Auth;
using AiBusinessPlatform.Application.Tools;
using AiBusinessPlatform.Domain;
using ModelContextProtocol.Server;

namespace AiBusinessPlatform.Mcp.Tools;

// The same IPurchaseOrderTools the dashboard's Purchase Orders screen calls, exposed here so the
// Assistant can restock from a supplier, or mark a delivery as received, by natural language too
// (Section 10.7's "one function, multiple entry points"). Mutating tools call
// IPermissionChecker.EnsurePermission first — see OrderMcpTools' remarks.
[McpServerToolType]
public class PurchaseOrderMcpTools(IPurchaseOrderTools purchaseOrderTools, ICurrentTenantProvider tenantProvider, IPermissionChecker permissionChecker)
{
    // Nullable parameters need an explicit `= null` default — see CatalogMcpTools' remarks.
    [McpServerTool(Name = "list_purchase_orders"), Description("Lists this business's purchase orders to suppliers, most recent first, optionally filtered to one status: \"Draft\", \"Ordered\", \"Received\", or \"Cancelled\".")]
    public Task<IReadOnlyList<PurchaseOrderSummary>> ListPurchaseOrders(PurchaseOrderStatus? status = null, CancellationToken cancellationToken = default)
        => purchaseOrderTools.ListPurchaseOrdersAsync(tenantProvider.CurrentBusinessId, status, cancellationToken);

    [McpServerTool(Name = "get_purchase_order"), Description("Gets full detail for one purchase order by its id: supplier, line items, and status.")]
    public Task<PurchaseOrderDetail> GetPurchaseOrder(Guid purchaseOrderId, CancellationToken cancellationToken = default)
        => purchaseOrderTools.GetPurchaseOrderAsync(tenantProvider.CurrentBusinessId, purchaseOrderId, cancellationToken);

    [McpServerTool(Name = "create_purchase_order"), Description("Creates a purchase order to restock from a supplier: one or more line items with the quantity and unit cost being ordered. For each line, either set catalogItemId to restock an existing item (resolve it via list_catalog_items first — never guess an id), or leave catalogItemId null and supply newItemName + newItemType (\"Stock\", \"TimeBased\", or \"Quote\") to order a product that isn't in the catalog yet — it's added to the catalog once the order is received and a sale price is set. currency is only required when every line is a new item; otherwise it's inferred automatically and can be omitted. expectedDeliveryDate is optional and used only to track whether the order arrives on time. Does not change stock or the catalog yet — call receive_purchase_order once the goods actually arrive.")]
    public Task<PurchaseOrderDetail> CreatePurchaseOrder(Guid supplierId, IReadOnlyList<PurchaseOrderLineItem> items, string? currency = null, DateTimeOffset? expectedDeliveryDate = null, CancellationToken cancellationToken = default)
    {
        permissionChecker.EnsurePermission(Permission.ManageSuppliers);
        return purchaseOrderTools.CreatePurchaseOrderAsync(tenantProvider.CurrentBusinessId, supplierId, items, currency, expectedDeliveryDate, cancellationToken);
    }

    // linePrices is optional here (unlike the REST endpoint, which still requires a complete list
    // and throws otherwise — Part 2's design principle: elicitation is an MCP-only UX enhancement
    // in this wrapper, not a change to the shared IPurchaseOrderTools contract). McpServer is
    // auto-bound by the SDK from the current request — it never appears in the tool's schema, so
    // the model never has to (and can't) supply it.
    [McpServerTool(Name = "receive_purchase_order"), Description("Marks a purchase order as received in full: transitions it to Received and increases stock for every line item all at once. Only an Ordered purchase order can be received. Only call this once the owner has clearly confirmed the goods have actually arrived. Pass linePrices to set/override the catalog sale price per line (by purchaseOrderItemId, from get_purchase_order) — a sale price is REQUIRED for any line that orders a new (not-yet-in-catalog) item, since receiving is what actually creates it in the catalog; it's optional for a line that restocks an existing item (omit to leave its price unchanged). If a required price is missing, the connected client will be asked for it directly — no need to guess one.")]
    public async Task<PurchaseOrderDetail> ReceivePurchaseOrder(
        Guid purchaseOrderId, McpServer server, IReadOnlyList<ReceivedLinePrice>? linePrices = null, CancellationToken cancellationToken = default)
    {
        permissionChecker.EnsurePermission(Permission.ManageSuppliers);

        var po = await purchaseOrderTools.GetPurchaseOrderAsync(tenantProvider.CurrentBusinessId, purchaseOrderId, cancellationToken);
        var effectivePrices = (linePrices ?? []).ToList();

        foreach (var item in po.Items)
        {
            if (!item.IsNewItem || effectivePrices.Any(lp => lp.PurchaseOrderItemId == item.Id))
            {
                continue;
            }

            var result = await server.ElicitAsync<SetSalePriceElicitation>(
                $"This purchase order includes a new item not yet in your catalog: '{item.Name}'. What sale price should it have?",
                cancellationToken: cancellationToken);

            if (!result.IsAccepted || result.Content is null)
            {
                throw new InvalidOperationException($"Cannot receive this purchase order — a sale price for '{item.Name}' is required.");
            }

            effectivePrices.Add(new ReceivedLinePrice(item.Id, result.Content.SalePrice));
        }

        return await purchaseOrderTools.ReceivePurchaseOrderAsync(tenantProvider.CurrentBusinessId, purchaseOrderId, effectivePrices, cancellationToken);
    }
}

public class SetSalePriceElicitation
{
    [Description("The sale price to charge customers for this new item.")]
    public decimal SalePrice { get; set; }
}
