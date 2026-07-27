using AiBusinessPlatform.Domain;

namespace AiBusinessPlatform.Application.Abstractions;

// Resolves the authenticated BusinessUser's role from the JWT's role claim — a pure claims read,
// no DB lookup, so a deactivated/role-changed staff member's already-issued token keeps whatever
// permissions it was issued with until it expires or they log in again (see RolePermissions).
// Null when there's no authenticated user in context, mirroring ICurrentUserProvider.
public interface ICurrentUserRoleProvider
{
    BusinessUserRole? CurrentUserRole { get; }
}
