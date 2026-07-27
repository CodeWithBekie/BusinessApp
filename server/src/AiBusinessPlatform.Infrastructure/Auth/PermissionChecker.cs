using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Auth;

namespace AiBusinessPlatform.Infrastructure.Auth;

public class PermissionChecker(ICurrentUserRoleProvider roleProvider) : IPermissionChecker
{
    public void EnsurePermission(Permission permission)
    {
        if (!RolePermissions.Has(roleProvider.CurrentUserRole, permission))
        {
            throw new UnauthorizedAccessException($"Your role does not have the '{permission}' permission.");
        }
    }
}
