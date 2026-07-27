using AiBusinessPlatform.Domain;

namespace AiBusinessPlatform.Application.Tools;

public record StaffSummary(Guid Id, string Name, string Email, BusinessUserRole Role, bool IsActive, DateTimeOffset CreatedAt);

// Owner-only staff roster management (Permission.ManageStaff) — not exposed to the AI
// assistant/MCP, REST-only (StaffEndpoints.cs), mirroring IMarketplaceTools' scoping rationale.
public interface IStaffTools
{
    Task<IReadOnlyList<StaffSummary>> ListStaffAsync(Guid businessId, CancellationToken cancellationToken = default);

    // No invite-email flow exists in this codebase (WhatsApp/Paynow connections are also
    // pasted-in manually) — the Owner sets the new staff member's initial password directly.
    Task<StaffSummary> InviteStaffAsync(Guid businessId, string name, string email, string password, BusinessUserRole role, CancellationToken cancellationToken = default);

    // callerId is the inviting Owner's own BusinessUser.Id — refuses to change the caller's own
    // row (self-lockout guard: an Owner can't demote or deactivate themselves this way).
    Task<StaffSummary> UpdateStaffAsync(Guid businessId, Guid staffId, Guid callerId, BusinessUserRole? role, bool? isActive, CancellationToken cancellationToken = default);
}
