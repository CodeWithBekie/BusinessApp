namespace AiBusinessPlatform.Application.Auth;

// Second entry point for RolePermissions, alongside the REST-layer PermissionAuthorizationHandler
// (Infrastructure) — MCP tools aren't reachable through ASP.NET Core's RequireAuthorization
// pipeline, so mutating MCP tool methods call EnsurePermission themselves before delegating.
public interface IPermissionChecker
{
    // Throws UnauthorizedAccessException if the current caller's role lacks the permission.
    void EnsurePermission(Permission permission);
}
