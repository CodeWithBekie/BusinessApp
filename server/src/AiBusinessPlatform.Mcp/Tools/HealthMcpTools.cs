using System.ComponentModel;
using AiBusinessPlatform.Application.Tools;
using ModelContextProtocol.Server;

namespace AiBusinessPlatform.Mcp.Tools;

// Section 10.7 — the same IHealthTool implementation the Api project calls in-process, exposed
// here as an MCP tool for external clients (Claude, ChatGPT, etc.). Proves "same function, two
// entry points" without duplicating logic.
[McpServerToolType]
public class HealthMcpTools(IHealthTool healthTool)
{
    [McpServerTool, Description("Checks whether the platform's core services (database) are reachable.")]
    public async Task<string> Ping(CancellationToken cancellationToken)
        => await healthTool.PingAsync(cancellationToken);
}
