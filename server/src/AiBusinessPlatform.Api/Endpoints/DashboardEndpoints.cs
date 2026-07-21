using AiBusinessPlatform.Application.Tools;
using AiBusinessPlatform.Domain;
using AiBusinessPlatform.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace AiBusinessPlatform.Api.Endpoints;

public static class DashboardEndpoints
{
    public static void MapDashboardEndpoints(this WebApplication app)
    {
        var api = app.MapGroup("/api");

        // Real EF-backed reads against the (seeded, tenant-filtered) dev DB — proves the data
        // wiring end-to-end without any order/approval workflow logic (out of scope for Phase 0).
        api.MapGet("/catalog", async (AiBusinessPlatformDbContext db, CancellationToken ct) =>
            await db.CatalogItems.AsNoTracking().ToListAsync(ct));

        api.MapGet("/orders", async (AiBusinessPlatformDbContext db, CancellationToken ct) =>
            await db.Orders.AsNoTracking().ToListAsync(ct));

        api.MapGet("/orders/{id:guid}", async (Guid id, AiBusinessPlatformDbContext db, CancellationToken ct) =>
            await db.Orders.AsNoTracking().FirstOrDefaultAsync(o => o.Id == id, ct) is { } order
                ? Results.Ok(order)
                : Results.NotFound());

        api.MapGet("/approvals", async (AiBusinessPlatformDbContext db, CancellationToken ct) =>
            await db.PendingApprovals.AsNoTracking().ToListAsync(ct));

        // FR17 (Section 6.3) — basic sales summary. `range` is accepted but ignored in Phase 0.
        api.MapGet("/sales/summary", async (string? range, AiBusinessPlatformDbContext db, CancellationToken ct) =>
        {
            var paidOrders = await db.Orders.AsNoTracking().Where(o => o.Status == OrderStatus.Paid).ToListAsync(ct);
            return Results.Ok(new
            {
                totalOrders = paidOrders.Count,
                totalAmount = paidOrders.Sum(o => o.TotalAmount)
            });
        });

        // Real order/approval workflow logic is out of scope for Phase 0 (Sections 6.3, 10.5).
        api.MapPost("/orders", () => Results.StatusCode(StatusCodes.Status501NotImplemented));
        api.MapPost("/approvals/{id:guid}/decision", (Guid id) => Results.StatusCode(StatusCodes.Status501NotImplemented));

        // Proof-of-wiring (Section 10.7): the exact same IHealthTool implementation the Mcp
        // project exposes as an MCP tool, called in-process here.
        api.MapGet("/health/ping", async (IHealthTool healthTool, CancellationToken ct) =>
            Results.Ok(new { message = await healthTool.PingAsync(ct) }));
    }
}
