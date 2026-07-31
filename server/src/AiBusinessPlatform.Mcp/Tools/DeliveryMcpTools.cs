using System.ComponentModel;
using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Auth;
using AiBusinessPlatform.Application.Tools;
using AiBusinessPlatform.Domain;
using ModelContextProtocol.Server;

namespace AiBusinessPlatform.Mcp.Tools;

// Section 10.3/12.4 — the same IDeliveryTools the dashboard calls, exposed here for external AI
// clients and the in-app Assistant. Follows OrderMcpTools' own convention: mutating tools call
// IPermissionChecker.EnsurePermission first (the MCP surface isn't reachable through ASP.NET
// Core's RequireAuthorization pipeline the REST endpoints use), the read-only lookup does not.
[McpServerToolType]
public class DeliveryMcpTools(IDeliveryTools deliveryTools, ICurrentTenantProvider tenantProvider, IPermissionChecker permissionChecker)
{
    [McpServerTool(Name = "assign_delivery_driver"), Description("Assigns (or reassigns) a driver to fulfil an order's delivery. Only valid once the order is Paid. driverName is optional. Resolve orderId via get_order or list_orders first — never guess an id.")]
    public Task<DeliveryAssignmentResult> AssignDeliveryDriver(Guid orderId, string? driverName = null, CancellationToken cancellationToken = default)
    {
        permissionChecker.EnsurePermission(Permission.ManageOrders);
        return deliveryTools.AssignDriverAsync(tenantProvider.CurrentBusinessId, orderId, driverName, cancellationToken);
    }

    [McpServerTool(Name = "update_delivery_status"), Description("Progresses an order's delivery status. status must be \"Pending\", \"Assigned\", \"InTransit\", or \"Delivered\". Fails if the delivery is already Delivered (terminal). Only call this when the owner has clearly and explicitly stated the delivery's new status.")]
    public Task<DeliveryStatusResult> UpdateDeliveryStatus(Guid orderId, DeliveryStatus status, CancellationToken cancellationToken = default)
    {
        permissionChecker.EnsurePermission(Permission.ManageOrders);
        return deliveryTools.UpdateDeliveryStatusAsync(tenantProvider.CurrentBusinessId, orderId, status, cancellationToken);
    }

    [McpServerTool(Name = "get_delivery_status"), Description("Gets the current delivery status and assigned driver (if any) for an order. Returns Pending with no driver if no delivery has been assigned yet.")]
    public Task<DeliveryStatusResult> GetDeliveryStatus(Guid orderId, CancellationToken cancellationToken = default)
        => deliveryTools.GetDeliveryStatusAsync(tenantProvider.CurrentBusinessId, orderId, cancellationToken);
}
