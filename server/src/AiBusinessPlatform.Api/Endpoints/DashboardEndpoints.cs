using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
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
        var api = app.MapGroup("/api").RequireAuthorization();

        // Real EF-backed reads against the (seeded, tenant-filtered) dev DB — proves the data
        // wiring end-to-end without any order/approval workflow logic (out of scope for Phase 0).
        api.MapGet("/catalog", async (AiBusinessPlatformDbContext db, CancellationToken ct) =>
            await db.CatalogItems.AsNoTracking().OrderBy(c => c.Name).ToListAsync(ct));

        // FR15 (Section 6.3) — owner adds a catalog item from the dashboard.
        api.MapPost("/catalog", async (
            CreateCatalogItemRequest request, AiBusinessPlatformDbContext db, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Name))
            {
                return Results.BadRequest("name is required.");
            }
            if (request.Price < 0)
            {
                return Results.BadRequest("price cannot be negative.");
            }
            if (request.StockQuantity is < 0)
            {
                return Results.BadRequest("stockQuantity cannot be negative.");
            }

            var item = new CatalogItem
            {
                Id = Guid.NewGuid(),
                BusinessId = tenantProvider.CurrentBusinessId,
                Name = request.Name.Trim(),
                ItemType = request.ItemType,
                Price = request.Price,
                Currency = string.IsNullOrWhiteSpace(request.Currency) ? "USD" : request.Currency.Trim(),
                StockQuantity = request.ItemType == CatalogItemType.Stock ? request.StockQuantity ?? 0 : null,
                Unit = string.IsNullOrWhiteSpace(request.Unit) ? "each" : request.Unit.Trim(),
                Active = true,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow
            };
            db.CatalogItems.Add(item);
            await db.SaveChangesAsync(ct);

            return Results.Created($"/api/catalog/{item.Id}", item);
        });

        // FR15 — owner edits or deactivates/reactivates a catalog item. Partial update: only
        // supplied fields change.
        api.MapPatch("/catalog/{id:guid}", async (
            Guid id, UpdateCatalogItemRequest request, AiBusinessPlatformDbContext db, CancellationToken ct) =>
        {
            var item = await db.CatalogItems.FirstOrDefaultAsync(c => c.Id == id, ct);
            if (item is null)
            {
                return Results.NotFound();
            }

            if (request.Name is not null)
            {
                if (string.IsNullOrWhiteSpace(request.Name))
                {
                    return Results.BadRequest("name cannot be blank.");
                }
                item.Name = request.Name.Trim();
            }
            if (request.Price is not null)
            {
                if (request.Price < 0)
                {
                    return Results.BadRequest("price cannot be negative.");
                }
                item.Price = request.Price.Value;
            }
            if (request.Currency is not null)
            {
                item.Currency = string.IsNullOrWhiteSpace(request.Currency) ? item.Currency : request.Currency.Trim();
            }
            if (request.StockQuantity is not null)
            {
                if (request.StockQuantity < 0)
                {
                    return Results.BadRequest("stockQuantity cannot be negative.");
                }
                item.StockQuantity = request.StockQuantity;
            }
            if (request.Unit is not null)
            {
                item.Unit = string.IsNullOrWhiteSpace(request.Unit) ? item.Unit : request.Unit.Trim();
            }
            if (request.Active is not null)
            {
                item.Active = request.Active.Value;
            }

            item.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct);

            return Results.Ok(item);
        });

        // Enriched with customer + item-count so the mobile Orders list doesn't need N follow-up
        // calls per row; `status` optionally filters to one OrderStatus (case-insensitive, ignored
        // if unrecognized rather than erroring — matches /sales/summary's lenient `range` param).
        api.MapGet("/orders", async (string? status, AiBusinessPlatformDbContext db, CancellationToken ct) =>
        {
            var query =
                from o in db.Orders.AsNoTracking()
                join c in db.Customers.AsNoTracking() on o.CustomerId equals c.Id
                select new { o, c };

            if (!string.IsNullOrWhiteSpace(status) && Enum.TryParse<OrderStatus>(status, true, out var parsedStatus))
            {
                query = query.Where(x => x.o.Status == parsedStatus);
            }

            var orders = await query
                .OrderByDescending(x => x.o.CreatedAt)
                .Select(x => new OrderListItemResponse(
                    x.o.Id,
                    x.c.Id,
                    x.c.WhatsAppNumber,
                    x.c.Name,
                    x.o.Status,
                    x.o.TotalAmount,
                    x.o.Currency,
                    db.OrderItems.Count(oi => oi.OrderId == x.o.Id),
                    x.o.CreatedAt,
                    x.o.UpdatedAt))
                .ToListAsync(ct);

            return Results.Ok(orders);
        });

        api.MapGet("/orders/{id:guid}", async (Guid id, AiBusinessPlatformDbContext db, CancellationToken ct) =>
        {
            var order = await db.Orders.AsNoTracking().FirstOrDefaultAsync(o => o.Id == id, ct);
            if (order is null)
            {
                return Results.NotFound();
            }

            var customer = await db.Customers.AsNoTracking().FirstOrDefaultAsync(c => c.Id == order.CustomerId, ct);

            var items = await (
                from oi in db.OrderItems.AsNoTracking()
                join ci in db.CatalogItems.AsNoTracking() on oi.CatalogItemId equals ci.Id into ciJoin
                from ci in ciJoin.DefaultIfEmpty()
                where oi.OrderId == order.Id
                select new OrderLineItemResponse(oi.CatalogItemId, ci != null ? ci.Name : "Unknown item", oi.Quantity, oi.UnitPrice, oi.Subtotal)
            ).ToListAsync(ct);

            var payment = await db.Payments.AsNoTracking().FirstOrDefaultAsync(p => p.OrderId == order.Id, ct);

            var response = new OrderDetailResponse(
                order.Id,
                order.CustomerId,
                customer?.WhatsAppNumber ?? "",
                customer?.Name,
                order.Status,
                order.TotalAmount,
                order.Currency,
                items,
                payment is null ? null : new OrderPaymentResponse(payment.Provider, payment.ProviderReference, payment.Status, payment.Amount, payment.ConfirmedAt),
                order.CreatedAt,
                order.UpdatedAt);

            return Results.Ok(response);
        });

        // FR18 (Section 6.3) — owner manually marks a Paid order as delivered/fulfilled.
        api.MapPost("/orders/{id:guid}/fulfill", async (
            Guid id, ClaimsPrincipal user, IOrderTools orderTools, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
        {
            var decidedBy = Guid.Parse(user.FindFirstValue(JwtRegisteredClaimNames.Sub)!);
            try
            {
                var result = await orderTools.MarkOrderFulfilledAsync(tenantProvider.CurrentBusinessId, id, decidedBy, ct);
                return Results.Ok(result);
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        });

        api.MapGet("/approvals", async (AiBusinessPlatformDbContext db, CancellationToken ct) =>
            await db.PendingApprovals.AsNoTracking().OrderByDescending(a => a.RequestedAt).ToListAsync(ct));

        // FR17 (Section 6.3) — sales summary. Thin mapping over IInsightsTools.GetSalesSummaryAsync
        // — the same function backing the Assistant chat's get_sales_summary tool and the MCP
        // server's equivalent tool (Section 10.2/10.7's "one function, multiple entry points").
        api.MapGet("/sales/summary", async (string? range, IInsightsTools insightsTools, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
        {
            var insight = await insightsTools.GetSalesSummaryAsync(tenantProvider.CurrentBusinessId, range, ct);
            var totals = insight.Totals.Select(t => new SalesCurrencyTotal(t.Currency, t.OrderCount, t.TotalAmount)).ToList();
            var trend = insight.Trend.Select(t => new SalesTrendPoint(t.Date, t.OrderCount, t.TotalAmount)).ToList();
            var topItems = insight.TopItems.Select(t => new SalesTopItem(t.CatalogItemId, t.Name, t.QuantitySold, t.Revenue)).ToList();
            return Results.Ok(new SalesSummaryResponse(insight.Range, insight.RangeStart, insight.TotalOrders, totals, trend, topItems));
        });

        // Real order-creation workflow is still out of scope for Phase 0 — orders are only ever
        // created via the AI orchestrator's reserve_stock tool today (Section 6.3).
        api.MapPost("/orders", () => Results.StatusCode(StatusCodes.Status501NotImplemented));

        // Section 10.5 — the ONLY path that can move a PendingApproval out of Pending; never the AI.
        api.MapPost("/approvals/{id:guid}/decision", async (
            Guid id, ApprovalDecisionRequest request, ClaimsPrincipal user,
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

            // The decision-maker is always the authenticated caller's own id — never
            // client-supplied, since trusting a caller's claim of "who I am" isn't sound once
            // other businesses' users could plausibly call this endpoint (Section 14/15).
            var decidedBy = Guid.Parse(user.FindFirstValue(JwtRegisteredClaimNames.Sub)!);

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

        // Section 13.2 — connects the business's own Paynow merchant integration. Mirrors
        // /whatsapp/connect exactly: a business has at most one PaynowConnection, so this is
        // create-or-update, active immediately (no separate Paynow-side verification step to wait for).
        api.MapPost("/payments/connect", async (
            PaynowConnectRequest request, AiBusinessPlatformDbContext db, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.IntegrationId) || string.IsNullOrWhiteSpace(request.IntegrationKey) || string.IsNullOrWhiteSpace(request.NotificationEmail))
            {
                return Results.BadRequest("integrationId, integrationKey, and notificationEmail are required.");
            }

            var connection = await db.PaynowConnections
                .FirstOrDefaultAsync(c => c.BusinessId == tenantProvider.CurrentBusinessId, ct);

            if (connection is null)
            {
                connection = new PaynowConnection
                {
                    Id = Guid.NewGuid(),
                    BusinessId = tenantProvider.CurrentBusinessId,
                    CreatedAt = DateTimeOffset.UtcNow
                };
                db.PaynowConnections.Add(connection);
            }

            connection.IntegrationId = request.IntegrationId;
            connection.IntegrationKey = request.IntegrationKey;
            connection.NotificationEmail = request.NotificationEmail;

            await db.SaveChangesAsync(ct);
            return Results.Ok(connection);
        });

        // Proof-of-wiring (Section 10.7): the exact same IHealthTool implementation the Mcp
        // project exposes as an MCP tool, called in-process here.
        api.MapGet("/health/ping", async (IHealthTool healthTool, CancellationToken ct) =>
            Results.Ok(new { message = await healthTool.PingAsync(ct) }));
    }
}
