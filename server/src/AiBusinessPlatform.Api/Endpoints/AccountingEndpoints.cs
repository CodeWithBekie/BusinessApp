using AiBusinessPlatform.Api.Contracts;
using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Tools;

namespace AiBusinessPlatform.Api.Endpoints;

// The reporting + expense half of the accounting suite (Permission.ViewAccounting — see
// RolePermissions). A separate route group so this file stays self-contained, mirroring
// StaffEndpoints.cs/MarketplaceEndpoints.cs's one-file-per-concern convention.
public static class AccountingEndpoints
{
    public static void MapAccountingEndpoints(this WebApplication app)
    {
        var accounting = app.MapGroup("/api/accounting")
            .RequireAuthorization("BusinessOnly", "Permission:ViewAccounting");

        accounting.MapGet("/cash-up", async (
            DateOnly? date, IAccountingTools accountingTools, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
            Results.Ok(await accountingTools.GetCashUpAsync(tenantProvider.CurrentBusinessId, date, ct)));

        accounting.MapGet("/profit-and-loss", async (
            string? range, DateTimeOffset? from, DateTimeOffset? to, IAccountingTools accountingTools, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
        {
            try
            {
                return Results.Ok(await accountingTools.GetProfitAndLossAsync(tenantProvider.CurrentBusinessId, range, from, to, ct));
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        });

        accounting.MapGet("/general-ledger", async (
            string? accountCode, DateTimeOffset? from, DateTimeOffset? to, IAccountingTools accountingTools, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
            Results.Ok(await accountingTools.GetGeneralLedgerAsync(tenantProvider.CurrentBusinessId, accountCode, from, to, ct)));

        accounting.MapGet("/trial-balance", async (
            DateTimeOffset? asOf, IAccountingTools accountingTools, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
            Results.Ok(await accountingTools.GetTrialBalanceAsync(tenantProvider.CurrentBusinessId, asOf, ct)));

        accounting.MapGet("/cash-flow", async (
            string? range, DateTimeOffset? from, DateTimeOffset? to, IAccountingTools accountingTools, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
        {
            try
            {
                return Results.Ok(await accountingTools.GetCashFlowAsync(tenantProvider.CurrentBusinessId, range, from, to, ct));
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        });

        var expenses = app.MapGroup("/api/expenses")
            .RequireAuthorization("BusinessOnly", "Permission:ViewAccounting");

        expenses.MapGet("/", async (
            DateTimeOffset? from, DateTimeOffset? to, IExpenseTools expenseTools, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
            Results.Ok(await expenseTools.ListExpensesAsync(tenantProvider.CurrentBusinessId, from, to, ct)));

        expenses.MapPost("/", async (
            CreateExpenseRequest request, IExpenseTools expenseTools, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
        {
            try
            {
                var result = await expenseTools.CreateExpenseAsync(
                    tenantProvider.CurrentBusinessId, request.Category, request.Description, request.Amount,
                    request.Currency, request.PaymentMethod, request.IncurredAt, ct);
                return Results.Created($"/api/expenses/{result.Id}", result);
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        });

        expenses.MapDelete("/{id:guid}", async (
            Guid id, IExpenseTools expenseTools, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
        {
            try
            {
                await expenseTools.DeleteExpenseAsync(tenantProvider.CurrentBusinessId, id, ct);
                return Results.NoContent();
            }
            catch (KeyNotFoundException ex)
            {
                return Results.NotFound(ex.Message);
            }
        });
    }
}
