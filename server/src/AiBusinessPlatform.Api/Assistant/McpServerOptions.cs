namespace AiBusinessPlatform.Api.Assistant;

// Section 10.2/10.7 — where the Assistant chat endpoint finds the platform's own MCP server. Not a
// secret; just wiring, since the Assistant connects as an MCP client using the caller's own bearer
// token rather than any credential of its own.
public class McpServerOptions
{
    public const string SectionName = "McpServer";

    public string BaseUrl { get; set; } = "http://localhost:5262";
}
