namespace AiBusinessPlatform.Application.Abstractions;

// Resolved once at ingress (webhook or authenticated dashboard session) and passed through explicitly —
// never re-derived from message content (spec Section 9.3).
public interface ICurrentTenantProvider
{
    Guid CurrentBusinessId { get; }
}
