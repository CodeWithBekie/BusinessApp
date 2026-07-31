using System.ComponentModel;
using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Auth;
using AiBusinessPlatform.Application.Tools;
using AiBusinessPlatform.Domain;
using ModelContextProtocol.Server;

namespace AiBusinessPlatform.Mcp.Tools;

// Section 10.7 — the same ICatalogTools the WhatsApp orchestrator and dashboard call, exposed here
// for external AI clients AND the in-app Assistant (which is itself an MCP client of this server,
// Section 10.2). Reserve/release/finalize stock stay off this list — those are steps in the
// customer-facing order flow, not something an owner-facing assistant should trigger directly.
// Mutating tools call IPermissionChecker.EnsurePermission first — see OrderMcpTools' remarks.
[McpServerToolType]
public class CatalogMcpTools(ICatalogTools catalogTools, ICurrentTenantProvider tenantProvider, IPermissionChecker permissionChecker)
{
    [McpServerTool(Name = "check_catalog_availability"), Description("Finds catalog items matching a free-text query and returns price/stock availability.")]
    public Task<IReadOnlyList<CatalogAvailabilityMatch>> CheckAvailability(string itemQuery, CancellationToken cancellationToken)
        => catalogTools.CheckAvailabilityAsync(tenantProvider.CurrentBusinessId, itemQuery, cancellationToken);

    // Nullable parameters need an explicit `= null` default — without one, the MCP SDK's
    // reflection-based schema generation marks them "required", and a caller that omits an
    // optional argument (as models routinely do) gets a hard "missing required parameter" error.
    [McpServerTool(Name = "list_catalog_items"), Description("Lists this business's catalog items, optionally filtered to only active (non-deactivated) items and/or only items at or below their low-stock threshold.")]
    public Task<IReadOnlyList<CatalogItemSummary>> ListCatalogItems(bool? activeOnly = null, bool? lowStockOnly = null, CancellationToken cancellationToken = default)
        => catalogTools.ListCatalogItemsAsync(tenantProvider.CurrentBusinessId, activeOnly, lowStockOnly, cancellationToken);

    [McpServerTool(Name = "create_catalog_item"), Description("Creates a new catalog item. itemType must be \"Stock\", \"TimeBased\", or \"Quote\". currency defaults to USD, unit defaults to \"each\", stockQuantity and lowStockThreshold only apply to Stock items (lowStockThreshold defaults to 5). code is an optional SKU/item code shown on invoices. Only call this when the owner has clearly and explicitly asked to add a new item.")]
    public Task<CatalogItemSummary> CreateCatalogItem(string name, CatalogItemType itemType, decimal price, string? currency = null, int? stockQuantity = null, string? unit = null, string? code = null, int? lowStockThreshold = null, CancellationToken cancellationToken = default)
    {
        permissionChecker.EnsurePermission(Permission.ManageCatalog);
        return catalogTools.CreateCatalogItemAsync(tenantProvider.CurrentBusinessId, name, itemType, price, currency, stockQuantity, unit, code, lowStockThreshold, cancellationToken);
    }

    [McpServerTool(Name = "update_catalog_item"), Description("Edits an existing catalog item's name, price, currency, unit, stock quantity, low-stock threshold, code, and/or active status — only the fields provided are changed. Set active=false to deactivate an item, active=true to reactivate it. Only call this when the owner has clearly and explicitly asked for this change.")]
    public Task<CatalogItemSummary> UpdateCatalogItem(Guid itemId, string? name = null, decimal? price = null, string? currency = null, int? stockQuantity = null, string? unit = null, bool? active = null, string? code = null, int? lowStockThreshold = null, CancellationToken cancellationToken = default)
    {
        permissionChecker.EnsurePermission(Permission.ManageCatalog);
        return catalogTools.UpdateCatalogItemAsync(tenantProvider.CurrentBusinessId, itemId, name, price, currency, stockQuantity, unit, active, code, lowStockThreshold, cancellationToken);
    }
}
