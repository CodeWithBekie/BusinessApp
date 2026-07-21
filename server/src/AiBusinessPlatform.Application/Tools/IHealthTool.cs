using System.ComponentModel;

namespace AiBusinessPlatform.Application.Tools;

// Proof-of-wiring tool (Section 10.7): the only Section 10.3 function with a real Phase 0
// implementation, exposed identically via the Api's minimal-API endpoint and the Mcp server's
// [McpServerTool] — demonstrating "same function, two entry points" end-to-end.
public interface IHealthTool
{
    [Description("Checks whether the platform's core services (database) are reachable.")]
    Task<string> PingAsync(CancellationToken cancellationToken = default);
}
