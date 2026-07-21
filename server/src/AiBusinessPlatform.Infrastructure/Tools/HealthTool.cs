using AiBusinessPlatform.Application.Tools;
using AiBusinessPlatform.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace AiBusinessPlatform.Infrastructure.Tools;

public class HealthTool(AiBusinessPlatformDbContext dbContext) : IHealthTool
{
    public async Task<string> PingAsync(CancellationToken cancellationToken = default)
    {
        await dbContext.Database.CanConnectAsync(cancellationToken);
        return "pong";
    }
}
