namespace AiBusinessPlatform.Domain.Entities;

// Section 10.6 — RAG source documents uploaded per business.
public class Document : ITenantScoped
{
    public Guid Id { get; set; }
    public Guid BusinessId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string SourceType { get; set; } = string.Empty;
    public DateTimeOffset UploadedAt { get; set; }
}
