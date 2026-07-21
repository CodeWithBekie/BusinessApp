namespace AiBusinessPlatform.Domain.Entities;

// item_type = TimeBased catalog items book against these.
public class TimeSlot : ITenantScoped
{
    public Guid Id { get; set; }
    public Guid BusinessId { get; set; }
    public Guid CatalogItemId { get; set; }
    public DateTimeOffset StartTime { get; set; }
    public DateTimeOffset EndTime { get; set; }
    public TimeSlotStatus Status { get; set; } = TimeSlotStatus.Available;
}
