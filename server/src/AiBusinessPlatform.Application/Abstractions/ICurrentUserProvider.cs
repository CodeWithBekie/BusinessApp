namespace AiBusinessPlatform.Application.Abstractions;

// Resolves the authenticated BusinessUser making the current call, distinct from
// ICurrentTenantProvider's business_id — needed wherever an action must record "who did this"
// (e.g. approval decisions, marking an order fulfilled) without trusting a model- or
// caller-supplied value. Null when there's no authenticated user in context (e.g. a background
// consumer resolved via ICurrentTenantSetter, which has no associated user).
public interface ICurrentUserProvider
{
    Guid? CurrentUserId { get; }
}
