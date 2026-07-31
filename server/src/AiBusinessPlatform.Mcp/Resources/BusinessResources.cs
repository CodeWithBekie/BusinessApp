using System.Text.Json;
using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Tools;
using ModelContextProtocol.Server;

namespace AiBusinessPlatform.Mcp.Resources;

// Read-only business data exposed as MCP resources rather than tools — meant to be attached as
// context by an MCP host (the Assistant's "Attach" UI), not invoked by the model like a tool call.
// Each method reuses the exact same Application-layer function the equivalent MCP tool/REST
// endpoint already calls (Section 10.7's "one function, multiple entry points"). Resource methods
// must return one of a closed set of SDK-recognized types (string, ResourceContents, etc.) —
// unlike tools, an arbitrary returned record throws — so every method here serializes to JSON text
// itself rather than returning the record directly.
[McpServerResourceType]
public class BusinessResources(
    ICatalogTools catalogTools,
    IInsightsTools insightsTools,
    ISupplierTools supplierTools,
    IOrderTools orderTools,
    IPurchaseOrderTools purchaseOrderTools,
    ICurrentTenantProvider tenantProvider)
{
    [McpServerResource(UriTemplate = "business://catalog", Name = "catalog", MimeType = "application/json")]
    public async Task<string> GetCatalog(CancellationToken cancellationToken)
    {
        var items = await catalogTools.ListCatalogItemsAsync(tenantProvider.CurrentBusinessId, true, null, cancellationToken);
        return JsonSerializer.Serialize(items);
    }

    [McpServerResource(UriTemplate = "business://sales-summary", Name = "sales-summary", MimeType = "application/json")]
    public async Task<string> GetSalesSummary(CancellationToken cancellationToken)
    {
        var summary = await insightsTools.GetSalesSummaryAsync(tenantProvider.CurrentBusinessId, "30d", cancellationToken: cancellationToken);
        return JsonSerializer.Serialize(summary);
    }

    [McpServerResource(UriTemplate = "business://suppliers", Name = "suppliers", MimeType = "application/json")]
    public async Task<string> GetSuppliers(CancellationToken cancellationToken)
    {
        var suppliers = await supplierTools.ListSuppliersAsync(tenantProvider.CurrentBusinessId, null, cancellationToken);
        return JsonSerializer.Serialize(suppliers);
    }

    [McpServerResource(UriTemplate = "business://orders/{orderId}", Name = "order", MimeType = "application/json")]
    public async Task<string> GetOrder(Guid orderId, CancellationToken cancellationToken)
    {
        var order = await orderTools.GetOrderAsync(tenantProvider.CurrentBusinessId, orderId, cancellationToken);
        return JsonSerializer.Serialize(order);
    }

    [McpServerResource(UriTemplate = "business://purchase-orders/{purchaseOrderId}", Name = "purchase-order", MimeType = "application/json")]
    public async Task<string> GetPurchaseOrder(Guid purchaseOrderId, CancellationToken cancellationToken)
    {
        var purchaseOrder = await purchaseOrderTools.GetPurchaseOrderAsync(tenantProvider.CurrentBusinessId, purchaseOrderId, cancellationToken);
        return JsonSerializer.Serialize(purchaseOrder);
    }
}
