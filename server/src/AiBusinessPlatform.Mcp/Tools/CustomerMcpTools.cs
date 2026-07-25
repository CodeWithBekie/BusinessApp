using System.ComponentModel;
using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Tools;
using ModelContextProtocol.Server;

namespace AiBusinessPlatform.Mcp.Tools;

// The same ICustomerTools the dashboard's customer picker calls, exposed here so the Assistant can
// resolve "did we sell to them before?" by natural language too (Section 10.7's "one function,
// multiple entry points").
[McpServerToolType]
public class CustomerMcpTools(ICustomerTools customerTools, ICurrentTenantProvider tenantProvider)
{
    // Nullable parameter needs an explicit `= null` default — see CatalogMcpTools' remarks.
    [McpServerTool(Name = "list_customers"), Description("Searches this business's customers by name or WhatsApp number, most recently created first. Omit search to list all. Call this before record_pos_sale when the owner mentions a customer by name, to find their existing customerId instead of creating a duplicate.")]
    public Task<IReadOnlyList<CustomerSummary>> ListCustomers(string? search = null, CancellationToken cancellationToken = default)
        => customerTools.ListCustomersAsync(tenantProvider.CurrentBusinessId, search, cancellationToken);
}
