using System.Diagnostics;
using System.Net.NetworkInformation;

namespace AiBusinessPlatform.Api.DevTools;

// Dev-only convenience: starting the Api (dotnet run, dotnet watch, or F5 in an IDE) also brings up
// the rest of the local stack — the Mcp server, the mobile Expo web preview, and the MCP Inspector —
// as child processes, and tears them down when the Api stops. Registered only in Development
// (Program.cs) since this is purely a local dev-experience shortcut, never something a deployed
// instance of this host should do. Swagger needs no process of its own — it's already just a route
// on this same running Api.
//
// Each child is skipped if something is already listening on its port, so re-running the Api during
// iterative dev (e.g. dotnet watch restarts) doesn't pile up duplicate Mcp/Expo/Inspector processes
// or crash on "address already in use".
public class DevOrchestratorHostedService(ILogger<DevOrchestratorHostedService> logger) : IHostedService
{
    private readonly List<Process> _children = [];

    public Task StartAsync(CancellationToken cancellationToken)
    {
        var repoRoot = FindRepoRoot();
        if (repoRoot is null)
        {
            logger.LogWarning("DevOrchestrator: could not locate the repo root (expected sibling 'server'/'mobile' folders) — skipping auto-launch of Mcp/mobile/Inspector.");
            return Task.CompletedTask;
        }

        TryLaunch("Mcp", 5262, "dotnet", "run", Path.Combine(repoRoot, "server", "src", "AiBusinessPlatform.Mcp"));
        TryLaunch("mobile (Expo web)", 8090, "cmd.exe", "/c npx expo start --web --port 8090", Path.Combine(repoRoot, "mobile"));
        TryLaunch("MCP Inspector", 6274, "cmd.exe", "/c npx @modelcontextprotocol/inspector", repoRoot);

        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        foreach (var process in _children)
        {
            try
            {
                if (!process.HasExited)
                {
                    process.Kill(entireProcessTree: true);
                }
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "DevOrchestrator: failed to stop a child process cleanly.");
            }
        }

        return Task.CompletedTask;
    }

    private void TryLaunch(string label, int port, string fileName, string arguments, string workingDirectory)
    {
        if (IsPortOpen(port))
        {
            logger.LogInformation("DevOrchestrator: {Label} already running on port {Port} — not launching another copy.", label, port);
            return;
        }

        if (!Directory.Exists(workingDirectory))
        {
            logger.LogWarning("DevOrchestrator: {Label}'s working directory {Dir} doesn't exist — skipping.", label, workingDirectory);
            return;
        }

        try
        {
            var process = Process.Start(new ProcessStartInfo
            {
                FileName = fileName,
                Arguments = arguments,
                WorkingDirectory = workingDirectory,
                UseShellExecute = false,
            });
            if (process is not null)
            {
                _children.Add(process);
                logger.LogInformation("DevOrchestrator: launched {Label} (pid {Pid}).", label, process.Id);
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "DevOrchestrator: failed to launch {Label}.", label);
        }
    }

    private static bool IsPortOpen(int port) =>
        IPGlobalProperties.GetIPGlobalProperties().GetActiveTcpListeners().Any(e => e.Port == port);

    private static string? FindRepoRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            if (Directory.Exists(Path.Combine(dir.FullName, "server")) && Directory.Exists(Path.Combine(dir.FullName, "mobile")))
            {
                return dir.FullName;
            }
            dir = dir.Parent;
        }
        return null;
    }
}
