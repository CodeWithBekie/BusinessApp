using System.ComponentModel;
using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Auth;
using AiBusinessPlatform.Application.Tools;
using ModelContextProtocol.Server;

namespace AiBusinessPlatform.Mcp.Tools;

// The same ISupplierTools the dashboard's Suppliers tab calls, exposed here so the Assistant can
// look up or add a supplier by natural language too (Section 10.7's "one function, multiple entry
// points"). Mutating tools call IPermissionChecker.EnsurePermission first — see OrderMcpTools' remarks.
[McpServerToolType]
public class SupplierMcpTools(ISupplierTools supplierTools, ICurrentTenantProvider tenantProvider, IPermissionChecker permissionChecker)
{
    // Nullable parameters need an explicit `= null` default — see CatalogMcpTools' remarks.
    [McpServerTool(Name = "list_suppliers"), Description("Searches this business's suppliers by name, most recently created first. Omit search to list all. Call this before create_purchase_order to resolve the supplierId.")]
    public Task<IReadOnlyList<SupplierSummary>> ListSuppliers(string? search = null, CancellationToken cancellationToken = default)
        => supplierTools.ListSuppliersAsync(tenantProvider.CurrentBusinessId, search, cancellationToken);

    [McpServerTool(Name = "create_supplier"), Description("Adds a new supplier this business buys stock from. Check list_suppliers first to avoid creating a duplicate.")]
    public Task<SupplierSummary> CreateSupplier(string name, string? contactPhone = null, string? email = null, string? notes = null, CancellationToken cancellationToken = default)
    {
        permissionChecker.EnsurePermission(Permission.ManageSuppliers);
        return supplierTools.CreateSupplierAsync(tenantProvider.CurrentBusinessId, name, contactPhone, email, notes, cancellationToken);
    }
}
