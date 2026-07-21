namespace AiBusinessPlatform.Domain.Entities;

// Section 10.3/15 — every state-changing action and AI tool call is recorded here.
public class AuditLog : ITenantScoped
{
    public Guid Id { get; set; }
    public Guid BusinessId { get; set; }
    public AuditActorType ActorType { get; set; }
    public string ActorId { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public string EntityType { get; set; } = string.Empty;
    public string EntityId { get; set; } = string.Empty;
    public string BeforeStateJson { get; set; } = "{}";
    public string AfterStateJson { get; set; } = "{}";
    public DateTimeOffset CreatedAt { get; set; }
}
