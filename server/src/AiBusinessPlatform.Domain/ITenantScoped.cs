namespace AiBusinessPlatform.Domain;

// Marker interface for every table scoped by business_id (spec Section 11 isolation rule).
// AiBusinessPlatformDbContext applies a global query filter to every entity implementing this.
public interface ITenantScoped
{
    Guid BusinessId { get; set; }
}
