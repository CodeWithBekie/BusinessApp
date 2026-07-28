using AiBusinessPlatform.Domain;

namespace AiBusinessPlatform.Application.Tools;

// Status is computed, not stored: "Active" (IsActive), "Deactivated" (!IsActive, previously
// accepted, no pending invite), "Pending" (!IsActive, invite not yet expired), "Expired"
// (!IsActive, invite window passed) — lets the roster UI tell a genuine deactivation apart from
// a stale, never-accepted invite.
public record StaffSummary(Guid Id, string Name, string Email, BusinessUserRole Role, bool IsActive, string Status, DateTimeOffset CreatedAt);

// The raw invite token/link is only ever returned here (invite/resend) — never part of
// StaffSummary, since that's returned from ListStaffAsync to anyone with ManageStaff.
public record StaffInviteResult(StaffSummary Staff, string InviteToken, string InviteLink, DateTimeOffset ExpiresAt);

// Owner-only staff roster management (Permission.ManageStaff) — not exposed to the AI
// assistant/MCP, REST-only (StaffEndpoints.cs), mirroring IMarketplaceTools' scoping rationale.
public interface IStaffTools
{
    Task<IReadOnlyList<StaffSummary>> ListStaffAsync(Guid businessId, CancellationToken cancellationToken = default);

    // No email/SMTP infrastructure exists in this codebase (WhatsApp/Paynow connections are also
    // pasted-in manually) — instead of the Owner choosing the new staff member's password, this
    // creates a pending (IsActive = false) account with an invite token/link the Owner shares
    // themselves (WhatsApp, SMS, verbally); the invitee sets their own password via
    // AuthEndpoints.AcceptInvite.
    Task<StaffInviteResult> InviteStaffAsync(Guid businessId, string name, string email, BusinessUserRole role, CancellationToken cancellationToken = default);

    // Regenerates the token/expiry for a still-pending invite (e.g. it was lost or expired).
    // Throws if the staff member already accepted (IsActive == true).
    Task<StaffInviteResult> ResendStaffInviteAsync(Guid businessId, Guid staffId, CancellationToken cancellationToken = default);

    // callerId is the inviting Owner's own BusinessUser.Id — refuses to change the caller's own
    // row (self-lockout guard: an Owner can't demote or deactivate themselves this way).
    Task<StaffSummary> UpdateStaffAsync(Guid businessId, Guid staffId, Guid callerId, BusinessUserRole? role, bool? isActive, CancellationToken cancellationToken = default);
}
