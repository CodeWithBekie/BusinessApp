using AiBusinessPlatform.Application.Abstractions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace AiBusinessPlatform.Infrastructure.Data;

// Used only by `dotnet ef migrations add/database update` — avoids spinning up the full Api host
// (with its RabbitMQ connection etc.) just to generate a migration. Real request-time tenant
// resolution lives in the Api project's ICurrentTenantProvider implementation.
public class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<AiBusinessPlatformDbContext>
{
    public AiBusinessPlatformDbContext CreateDbContext(string[] args)
    {
        var connectionString = Environment.GetEnvironmentVariable("AIBP_CONNECTION_STRING")
            ?? "Host=localhost;Port=5433;Database=aibp_dev;Username=aibp;Password=devpassword";

        var optionsBuilder = new DbContextOptionsBuilder<AiBusinessPlatformDbContext>();
        optionsBuilder.UseNpgsql(connectionString, o => o.UseVector());

        return new AiBusinessPlatformDbContext(optionsBuilder.Options, new DesignTimeTenantProvider());
    }

    private class DesignTimeTenantProvider : ICurrentTenantProvider
    {
        public Guid CurrentBusinessId => Guid.Empty;
    }
}
