using System.Security.Claims;
using AiBusinessPlatform.Application.Auth;
using AiBusinessPlatform.Domain;
using Microsoft.AspNetCore.Authorization;

namespace AiBusinessPlatform.Infrastructure.Auth;

public class PermissionRequirement(Permission permission) : IAuthorizationRequirement
{
    public Permission Permission { get; } = permission;
}

// Pure claims-based check (no DB read) — resolves the role straight off the JWT's role claim and
// consults RolePermissions, the same matrix IPermissionChecker uses for MCP tools. Deliberately
// stateless: a deactivated/role-changed staff member's already-issued token keeps working under
// its original permissions until it expires or they log in again (see StaffTools.UpdateStaffAsync).
public class PermissionAuthorizationHandler : AuthorizationHandler<PermissionRequirement>
{
    protected override Task HandleRequirementAsync(AuthorizationHandlerContext context, PermissionRequirement requirement)
    {
        var roleClaim = context.User.FindFirst(ClaimTypes.Role)?.Value;
        if (Enum.TryParse<BusinessUserRole>(roleClaim, out var role) && RolePermissions.Has(role, requirement.Permission))
        {
            context.Succeed(requirement);
        }

        return Task.CompletedTask;
    }
}
