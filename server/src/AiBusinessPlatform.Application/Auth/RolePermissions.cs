using AiBusinessPlatform.Domain;

namespace AiBusinessPlatform.Application.Auth;

// Single source of truth for the role -> permission matrix, consulted by both the REST
// authorization handler (PermissionAuthorizationHandler, Infrastructure) and the MCP tool gates
// (IPermissionChecker) so there is exactly one place this mapping is ever defined.
public static class RolePermissions
{
    private static readonly Dictionary<BusinessUserRole, HashSet<Permission>> Matrix = new()
    {
        [BusinessUserRole.Owner] = [
            Permission.ManageCatalog, Permission.ManageOrders, Permission.ManageSuppliers,
            Permission.ViewAccounting, Permission.DecideApprovals, Permission.ManageBusinessSettings,
            Permission.ManageStaff
        ],
        [BusinessUserRole.Manager] = [
            Permission.ManageCatalog, Permission.ManageOrders, Permission.ManageSuppliers,
            Permission.ViewAccounting, Permission.DecideApprovals, Permission.ManageBusinessSettings
        ],
        [BusinessUserRole.Cashier] = [Permission.ManageOrders],
        [BusinessUserRole.InventoryClerk] = [Permission.ManageCatalog, Permission.ManageSuppliers],
        [BusinessUserRole.Accountant] = [Permission.ViewAccounting]
    };

    public static bool Has(BusinessUserRole? role, Permission permission) =>
        role is not null && Matrix.TryGetValue(role.Value, out var permissions) && permissions.Contains(permission);
}
