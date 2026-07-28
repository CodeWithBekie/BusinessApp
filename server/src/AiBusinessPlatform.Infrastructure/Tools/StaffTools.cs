using System.Security.Cryptography;
using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Tools;
using AiBusinessPlatform.Domain;
using AiBusinessPlatform.Domain.Entities;
using AiBusinessPlatform.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace AiBusinessPlatform.Infrastructure.Tools;

// Invite/accept password hashing now happens in AuthEndpoints.AcceptInvite (the invitee sets
// their own password there) — this class no longer needs IPasswordHasher<BusinessUser>.
public class StaffTools(
    AiBusinessPlatformDbContext dbContext, ICurrentTenantProvider tenantProvider,
    IOptions<AppOptions> appOptions) : IStaffTools
{
    // Hand-typeable and URL-safe; excludes visually ambiguous characters (0/O, 1/I).
    private const string InviteTokenCharset = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
    private static readonly TimeSpan InviteValidity = TimeSpan.FromDays(7);

    public async Task<IReadOnlyList<StaffSummary>> ListStaffAsync(Guid businessId, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        var staff = await dbContext.BusinessUsers.AsNoTracking()
            .OrderBy(u => u.CreatedAt)
            .ToListAsync(cancellationToken);

        return staff.Select(ToSummary).ToList();
    }

    public async Task<StaffInviteResult> InviteStaffAsync(
        Guid businessId, string name, string email, BusinessUserRole role, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }
        if (string.IsNullOrWhiteSpace(name) || string.IsNullOrWhiteSpace(email))
        {
            throw new ArgumentException("name and email are required.");
        }

        // Global, not per-business — mirrors AuthEndpoints.Signup's own check (BusinessUser.Email
        // has a table-wide unique index, not scoped per-business).
        var emailTaken = await dbContext.BusinessUsers.IgnoreQueryFilters().AnyAsync(u => u.Email == email, cancellationToken);
        if (emailTaken)
        {
            throw new ArgumentException($"An account with email '{email}' already exists.");
        }

        var token = GenerateInviteToken();
        var expiresAt = DateTimeOffset.UtcNow.Add(InviteValidity);

        var staff = new BusinessUser
        {
            Id = Guid.NewGuid(),
            BusinessId = businessId,
            Name = name.Trim(),
            Email = email.Trim(),
            Role = role,
            IsActive = false,
            PasswordHash = string.Empty,
            InvitationToken = token,
            InvitationExpiresAt = expiresAt,
            CreatedAt = DateTimeOffset.UtcNow
        };
        dbContext.BusinessUsers.Add(staff);
        await dbContext.SaveChangesAsync(cancellationToken);

        return new StaffInviteResult(ToSummary(staff), token, BuildInviteLink(token), expiresAt);
    }

    public async Task<StaffInviteResult> ResendStaffInviteAsync(Guid businessId, Guid staffId, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        var staff = await dbContext.BusinessUsers.FirstOrDefaultAsync(u => u.Id == staffId, cancellationToken)
            ?? throw new KeyNotFoundException($"Staff member {staffId} not found.");
        if (staff.IsActive)
        {
            throw new ArgumentException("This staff member has already accepted their invite.");
        }

        var token = GenerateInviteToken();
        var expiresAt = DateTimeOffset.UtcNow.Add(InviteValidity);
        staff.InvitationToken = token;
        staff.InvitationExpiresAt = expiresAt;
        await dbContext.SaveChangesAsync(cancellationToken);

        return new StaffInviteResult(ToSummary(staff), token, BuildInviteLink(token), expiresAt);
    }

    public async Task<StaffSummary> UpdateStaffAsync(
        Guid businessId, Guid staffId, Guid callerId, BusinessUserRole? role, bool? isActive, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }
        if (staffId == callerId)
        {
            throw new ArgumentException("You cannot change your own role or active status this way.");
        }

        var staff = await dbContext.BusinessUsers.FirstOrDefaultAsync(u => u.Id == staffId, cancellationToken)
            ?? throw new KeyNotFoundException($"Staff member {staffId} not found.");

        if (role is not null)
        {
            staff.Role = role.Value;
        }
        if (isActive is not null)
        {
            staff.IsActive = isActive.Value;
        }

        await dbContext.SaveChangesAsync(cancellationToken);

        return ToSummary(staff);
    }

    private string BuildInviteLink(string token) => $"{appOptions.Value.PublicBaseUrl}/accept-invite/{token}";

    private static string GenerateInviteToken() => RandomNumberGenerator.GetString(InviteTokenCharset, 10);

    private static StaffSummary ToSummary(BusinessUser staff)
    {
        // InvitationToken is only ever non-null between an invite/resend and its acceptance —
        // once accepted it's cleared for good (AuthEndpoints.AcceptInvite), so !IsActive with a
        // null token can only mean "was accepted, later deactivated by the Owner", not a fresh
        // invite. That's what tells a real deactivation apart from an unaccepted invite below.
        var status = staff.IsActive
            ? "Active"
            : staff.InvitationToken is null
                ? "Deactivated"
                : staff.InvitationExpiresAt is { } expiresAt && expiresAt > DateTimeOffset.UtcNow
                    ? "Pending"
                    : "Expired";
        return new StaffSummary(staff.Id, staff.Name, staff.Email, staff.Role, staff.IsActive, status, staff.CreatedAt);
    }
}
