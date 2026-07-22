using System.Text.Json;
using AiBusinessPlatform.Api.Contracts;
using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Tools;
using AiBusinessPlatform.Domain;
using AiBusinessPlatform.Domain.Entities;
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

        // Real order-creation workflow is still out of scope for Phase 0 — orders are only ever
        // created via the AI orchestrator's reserve_stock tool today (Section 6.3).
        api.MapPost("/orders", () => Results.StatusCode(StatusCodes.Status501NotImplemented));

        // Section 10.5 — the ONLY path that can move a PendingApproval out of Pending; never the AI.
        api.MapPost("/approvals/{id:guid}/decision", async (
            Guid id, ApprovalDecisionRequest request,
            IApprovalTools approvalTools, IOrderTools orderTools, ICurrentTenantProvider tenantProvider,
            CancellationToken ct) =>
        {
            bool approve;
            if (string.Equals(request.Decision, "approve", StringComparison.OrdinalIgnoreCase))
            {
                approve = true;
            }
            else if (string.Equals(request.Decision, "reject", StringComparison.OrdinalIgnoreCase))
            {
                approve = false;
            }
            else
            {
                return Results.BadRequest("decision must be \"approve\" or \"reject\".");
            }

            // Phase 0 gap: no real auth/session exists yet, so the decision-maker defaults to the
            // seeded dev BusinessUser when the caller doesn't supply one (Section 14/15).
            var decidedBy = request.DecidedBy ?? DevSeedData.DevBusinessUserId;

            ApprovalDecisionResult decision;
            try
            {
                decision = await approvalTools.DecideApprovalAsync(tenantProvider.CurrentBusinessId, id, approve, decidedBy, ct);
            }
            catch (InvalidOperationException ex)
            {
                return Results.NotFound(ex.Message);
            }

            // Dispatch by ActionType — only on a fresh transition, never re-run on an idempotent
            // repeat call. A single `if` is proportionate for the one sensitive action type that
            // exists today; switch to a dictionary<string, handler> registry once a 2nd is added.
            if (!decision.WasAlreadyDecided && decision.ActionType == ApprovalActionTypes.CancelPaidOrder)
            {
                var details = JsonSerializer.Deserialize<CancelPaidOrderDetails>(decision.DetailsJson)!;
                if (approve)
                {
                    await orderTools.CancelPaidOrderAsync(tenantProvider.CurrentBusinessId, details.OrderId, decidedBy, ct);
                }
                else
                {
                    await orderTools.NotifyOrderCancellationRejectedAsync(tenantProvider.CurrentBusinessId, details.OrderId, decidedBy, ct);
                }
            }

            return Results.Ok(decision);
        });

        // Section 10.6/12.3 — document upload for RAG. Plain-text body only this pass, no
        // file/PDF upload parsing.
        api.MapPost("/documents", async (
            UploadDocumentRequest request, IRagTools ragTools, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Title) || string.IsNullOrWhiteSpace(request.Content))
            {
                return Results.BadRequest("title and content are required.");
            }

            var result = await ragTools.IngestDocumentAsync(tenantProvider.CurrentBusinessId, request.Title, request.SourceType ?? "text", request.Content, ct);
            return Results.Ok(result);
        });

        // Section 12.3/19 — stand-in for Meta's real embedded-signup/OAuth onboarding flow: the
        // operator pastes in values obtained directly from Meta's own dashboard. Status is set to
        // Active immediately (confirmed) since no live verification call exists yet to flip it
        // later; a business has at most one WhatsAppConnection, so this is create-or-update.
        api.MapPost("/whatsapp/connect", async (
            WhatsAppConnectRequest request, AiBusinessPlatformDbContext db, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.WabaId) || string.IsNullOrWhiteSpace(request.PhoneNumberId) || string.IsNullOrWhiteSpace(request.SystemUserToken))
            {
                return Results.BadRequest("wabaId, phoneNumberId, and systemUserToken are required.");
            }

            var connection = await db.WhatsAppConnections
                .FirstOrDefaultAsync(c => c.BusinessId == tenantProvider.CurrentBusinessId, ct);

            if (connection is null)
            {
                connection = new WhatsAppConnection
                {
                    Id = Guid.NewGuid(),
                    BusinessId = tenantProvider.CurrentBusinessId,
                    CreatedAt = DateTimeOffset.UtcNow
                };
                db.WhatsAppConnections.Add(connection);
            }

            connection.WabaId = request.WabaId;
            connection.PhoneNumberId = request.PhoneNumberId;
            connection.SystemUserToken = request.SystemUserToken;
            connection.Status = WhatsAppConnectionStatus.Active;

            await db.SaveChangesAsync(ct);
            return Results.Ok(connection);
        });

        // Proof-of-wiring (Section 10.7): the exact same IHealthTool implementation the Mcp
        // project exposes as an MCP tool, called in-process here.
        api.MapGet("/health/ping", async (IHealthTool healthTool, CancellationToken ct) =>
            Results.Ok(new { message = await healthTool.PingAsync(ct) }));
    }
}
