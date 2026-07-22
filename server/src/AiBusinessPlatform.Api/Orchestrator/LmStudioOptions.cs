namespace AiBusinessPlatform.Api.Orchestrator;

public class LmStudioOptions
{
    public const string SectionName = "LmStudio";

    public string BaseUrl { get; set; } = "http://localhost:1234/v1";
    public string Model { get; set; } = string.Empty; // required — no sensible default
    public string EmbeddingModel { get; set; } = string.Empty; // required — no sensible default
    public string ApiKey { get; set; } = "lm-studio"; // overridden via dotnet user-secrets
}
