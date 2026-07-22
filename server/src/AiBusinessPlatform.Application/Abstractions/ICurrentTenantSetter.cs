namespace AiBusinessPlatform.Application.Abstractions;

// Lets a caller that has already resolved business_id through some non-HTTP mechanism (e.g. a
// queue message whose BusinessId was resolved at webhook ingress, Section 9.3) push that value
// into the same scoped ICurrentTenantProvider instance every other service in that DI scope will
// read. Must be registered so the concrete instance is shared with ICurrentTenantProvider in the
// same scope — see Program.cs's forwarding registration.
public interface ICurrentTenantSetter
{
    void SetBusinessId(Guid businessId);
}
