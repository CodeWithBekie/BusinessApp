# Auth/

The RBAC (role-based access control) model — three small files, one source of truth consulted by
both enforcement points in the system (REST middleware and manual MCP checks).

- **`Permission.cs`** — flat enum: `ManageCatalog`, `ManageOrders`, `ManageSuppliers`,
  `ViewAccounting`, `DecideApprovals`, `ManageBusinessSettings`, `ManageStaff`.
- **`RolePermissions.cs`** — the static `Dictionary<BusinessUserRole, HashSet<Permission>>` matrix:
  Owner has all 7; Manager has all but `ManageStaff`; Cashier has `ManageOrders` only;
  InventoryClerk has `ManageCatalog` + `ManageSuppliers`; Accountant has `ViewAccounting` only.
  `RolePermissions.Has(role, permission)` is the single check both entry points below call.
- **`IPermissionChecker.cs`** — `EnsurePermission(Permission)`, throws `UnauthorizedAccessException`.

## Why there are two enforcement points, not one

REST endpoints go through ASP.NET Core's `RequireAuthorization("Permission:X")` policy pipeline
(`Infrastructure/Auth/PermissionAuthorizationHandler.cs`). MCP tool calls **don't** — the MCP
transport bypasses ASP.NET Core's authorization middleware entirely — so every mutating MCP tool
method calls `IPermissionChecker.EnsurePermission(Permission.X)` itself, as its first line, before
doing anything else (`Infrastructure/Auth/PermissionChecker.cs` is the implementation). Both paths
ultimately call the exact same `RolePermissions.Has(...)` — this folder is that shared source of
truth, not a second, independent policy.

## Adding a new permission

1. Add the value to `Permission.cs`.
2. Add it to whichever roles in `RolePermissions.cs`'s matrix should have it.
3. Gate the REST route with `.RequireAuthorization("BusinessOnly", "Permission:YourNewValue")`.
4. Gate the matching MCP tool method (if any) with
   `permissionChecker.EnsurePermission(Permission.YourNewValue)` as its first line.

The mobile app hand-mirrors this matrix in `mobile/src/auth/permissions.ts` (no shared codegen
between the C# and TypeScript sides) — update that too, or a tab/button will be hidden/shown
incorrectly on the client even though the server enforces correctly.
