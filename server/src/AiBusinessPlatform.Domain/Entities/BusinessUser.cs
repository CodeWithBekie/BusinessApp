namespace AiBusinessPlatform.Domain.Entities;

public class BusinessUser : ITenantScoped
{
    public Guid Id { get; set; }
    public Guid BusinessId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public BusinessUserRole Role { get; set; } = BusinessUserRole.Cashier;
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; }

    // Set at invite time, cleared once the invitee accepts (see AuthEndpoints.AcceptInvite).
    // IsActive stays false for the whole pending window, so login is blocked the same way an
    // already-existing deactivated account is blocked (no separate "pending" auth check needed).
    public string? InvitationToken { get; set; }
    public DateTimeOffset? InvitationExpiresAt { get; set; }
}
