namespace AiBusinessPlatform.Infrastructure.WhatsApp;

public class WhatsAppOptions
{
    public const string SectionName = "WhatsApp";

    // Meta deprecates Graph API versions roughly twice a year — confirm this is still current
    // before going live with real credentials.
    public string GraphApiVersion { get; set; } = "v21.0";

    // Single app-level secrets (configured once in Meta's App Dashboard), NOT per-WhatsAppConnection
    // — see MetaWebhookSignatureVerifier's remarks. Set via dotnet user-secrets, never appsettings.json.
    public string WebhookVerifyToken { get; set; } = string.Empty;
    public string AppSecret { get; set; } = string.Empty;
}
