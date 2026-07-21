using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Tools;
using AiBusinessPlatform.Infrastructure.Data;
using AiBusinessPlatform.Infrastructure.Tools;
using AiBusinessPlatform.Mcp.Tenancy;
using AiBusinessPlatform.Mcp.Tools;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<AiBusinessPlatformDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("Default"), o => o.UseVector()));

builder.Services.AddScoped<ICurrentTenantProvider, FixedDevTenantProvider>();
builder.Services.AddScoped<IHealthTool, HealthTool>();

builder.Services
    .AddMcpServer()
    .WithHttpTransport()
    .WithTools<HealthMcpTools>();

var app = builder.Build();

app.MapMcp();

app.Run();
