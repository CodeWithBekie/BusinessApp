namespace AiBusinessPlatform.Domain.Entities;

// Section 10.5 — human-in-the-loop gating for sensitive AI-initiated actions.
public class PendingApproval : ITenantScoped
{
    public Guid Id { get; set; }
    public Guid BusinessId { get; set; }
    public string ActionType { get; set; } = string.Empty;
    public string DetailsJson { get; set; } = "{}";
    public ApprovalStatus Status { get; set; } = ApprovalStatus.Pending;
    public DateTimeOffset RequestedAt { get; set; }
    public DateTimeOffset? DecidedAt { get; set; }
    public Guid? DecidedBy { get; set; }
}
