namespace AiBusinessPlatform.Domain.Entities;

// Section 10.7/14 — scoped credential issued per business for external MCP clients (e.g. Claude, ChatGPT).
public class McpIntegrationAccount : ITenantScoped
{
    public Guid Id { get; set; }
    public Guid BusinessId { get; set; }
    public string ClientName { get; set; } = string.Empty;
    public string ScopedPermissionsJson { get; set; } = "[]";

    // Stored hashed/encrypted in production (Section 15); plaintext-in-config never allowed.
    public string ApiCredential { get; set; } = string.Empty;
    public McpIntegrationAccountStatus Status { get; set; } = McpIntegrationAccountStatus.Active;
    public DateTimeOffset CreatedAt { get; set; }
}
