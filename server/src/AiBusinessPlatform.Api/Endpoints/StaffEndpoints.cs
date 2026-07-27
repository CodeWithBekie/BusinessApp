using AiBusinessPlatform.Api.Contracts;
using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Tools;

namespace AiBusinessPlatform.Api.Endpoints;

// Owner-only staff roster management (Permission.ManageStaff — see RolePermissions). A separate
// route group from DashboardEndpoints' `/api` group so this file stays self-contained, mirroring
// MarketplaceEndpoints.cs/CustomerAuthEndpoints.cs's one-file-per-concern convention.
public static class StaffEndpoints
{
    public static void MapStaffEndpoints(this WebApplication app)
    {
        var staff = app.MapGroup("/api/staff")
            .RequireAuthorization("BusinessOnly", "Permission:ManageStaff");

        staff.MapGet("/", async (IStaffTools staffTools, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
            Results.Ok(await staffTools.ListStaffAsync(tenantProvider.CurrentBusinessId, ct)));

        staff.MapPost("/", async (
            InviteStaffRequest request, IStaffTools staffTools, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
        {
            try
            {
                var result = await staffTools.InviteStaffAsync(
                    tenantProvider.CurrentBusinessId, request.Name, request.Email, request.Password, request.Role, ct);
                return Results.Created($"/api/staff/{result.Id}", result);
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        });

        staff.MapPatch("/{id:guid}", async (
            Guid id, UpdateStaffRequest request, IStaffTools staffTools,
            ICurrentTenantProvider tenantProvider, ICurrentUserProvider userProvider, CancellationToken ct) =>
        {
            try
            {
                var result = await staffTools.UpdateStaffAsync(
                    tenantProvider.CurrentBusinessId, id, userProvider.CurrentUserId ?? Guid.Empty, request.Role, request.IsActive, ct);
                return Results.Ok(result);
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(ex.Message);
            }
            catch (KeyNotFoundException ex)
            {
                return Results.NotFound(ex.Message);
            }
        });
    }
}
