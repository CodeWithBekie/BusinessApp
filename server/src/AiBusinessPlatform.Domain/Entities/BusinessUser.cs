namespace AiBusinessPlatform.Domain.Entities;

public class BusinessUser : ITenantScoped
{
    public Guid Id { get; set; }
    public Guid BusinessId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public BusinessUserRole Role { get; set; } = BusinessUserRole.Staff;
    public DateTimeOffset CreatedAt { get; set; }
}
