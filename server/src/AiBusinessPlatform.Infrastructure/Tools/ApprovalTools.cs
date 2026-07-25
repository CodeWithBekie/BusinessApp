using System.Text.Json;
using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Tools;
using AiBusinessPlatform.Domain;
using AiBusinessPlatform.Domain.Entities;
using AiBusinessPlatform.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace AiBusinessPlatform.Infrastructure.Tools;

// Section 10.5 — deliberately has no dependency on IOrderTools (or any other tool interface):
// raising a request and deciding it are the only responsibilities here. Dispatching the actual
// approved/rejected action lives one level up (the dashboard decision endpoint), which is free to
// depend on both IApprovalTools and IOrderTools without creating a DI constructor cycle.
public class ApprovalTools(AiBusinessPlatformDbContext dbContext, ICurrentTenantProvider tenantProvider) : IApprovalTools
{
    public async Task<RequestApprovalResult> RequestApprovalAsync(Guid businessId, string actionType, string detailsJson, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        var approval = new PendingApproval
        {
            Id = Guid.NewGuid(),
            BusinessId = tenantProvider.CurrentBusinessId,
            ActionType = actionType,
            DetailsJson = detailsJson,
            Status = ApprovalStatus.Pending,
            RequestedAt = DateTimeOffset.UtcNow
        };
        dbContext.PendingApprovals.Add(approval);

        dbContext.AuditLogs.Add(new AuditLog
        {
            Id = Guid.NewGuid(),
            BusinessId = tenantProvider.CurrentBusinessId,
            ActorType = AuditActorType.System,
            ActorId = "ai-orchestrator",
            Action = "approval.requested",
            EntityType = nameof(PendingApproval),
            EntityId = approval.Id.ToString(),
            BeforeStateJson = "{}",
            AfterStateJson = JsonSerializer.Serialize(new { approval.ActionType, Status = approval.Status.ToString() }),
            CreatedAt = DateTimeOffset.UtcNow
        });

        await dbContext.SaveChangesAsync(cancellationToken);
        return new RequestApprovalResult(approval.Id);
    }

    public async Task<ApprovalStatusResult> GetApprovalStatusAsync(Guid pendingApprovalId, CancellationToken cancellationToken = default)
    {
        var approval = await dbContext.PendingApprovals.FirstOrDefaultAsync(a => a.Id == pendingApprovalId, cancellationToken)
            ?? throw new InvalidOperationException($"PendingApproval {pendingApprovalId} not found.");

        return new ApprovalStatusResult(approval.Id, approval.Status.ToString());
    }

    public async Task<ApprovalDecisionResult> DecideApprovalAsync(Guid businessId, Guid pendingApprovalId, bool approve, Guid? decidedBy, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        var approval = await dbContext.PendingApprovals.FirstOrDefaultAsync(a => a.Id == pendingApprovalId, cancellationToken)
            ?? throw new InvalidOperationException($"PendingApproval {pendingApprovalId} not found.");

        // Idempotent — mirrors OrderTools.ConfirmPaymentAsync's idempotent-webhook precedent.
        if (approval.Status != ApprovalStatus.Pending)
        {
            return new ApprovalDecisionResult(approval.Id, approval.ActionType, approval.DetailsJson, approval.Status.ToString(), WasAlreadyDecided: true);
        }

        var previousStatus = approval.Status;
        approval.Status = approve ? ApprovalStatus.Approved : ApprovalStatus.Rejected;
        approval.DecidedAt = DateTimeOffset.UtcNow;
        approval.DecidedBy = decidedBy;

        dbContext.AuditLogs.Add(new AuditLog
        {
            Id = Guid.NewGuid(),
            BusinessId = tenantProvider.CurrentBusinessId,
            ActorType = AuditActorType.User,
            ActorId = decidedBy?.ToString() ?? "unknown-dev-decision", // Phase 0 gap — no real auth/session yet (Section 14/15)
            Action = approve ? "approval.approved" : "approval.rejected",
            EntityType = nameof(PendingApproval),
            EntityId = approval.Id.ToString(),
            BeforeStateJson = JsonSerializer.Serialize(new { Status = previousStatus.ToString() }),
            AfterStateJson = JsonSerializer.Serialize(new { Status = approval.Status.ToString() }),
            CreatedAt = DateTimeOffset.UtcNow
        });

        await dbContext.SaveChangesAsync(cancellationToken);
        return new ApprovalDecisionResult(approval.Id, approval.ActionType, approval.DetailsJson, approval.Status.ToString(), WasAlreadyDecided: false);
    }

    public async Task<IReadOnlyList<ApprovalSummary>> ListApprovalsAsync(Guid businessId, ApprovalStatus? status, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        var query = dbContext.PendingApprovals.AsNoTracking().AsQueryable();
        if (status is not null)
        {
            query = query.Where(a => a.Status == status);
        }

        var approvals = await query.OrderByDescending(a => a.RequestedAt).ToListAsync(cancellationToken);
        return approvals
            .Select(a => new ApprovalSummary(a.Id, a.ActionType, a.DetailsJson, a.Status, a.RequestedAt, a.DecidedAt, a.DecidedBy))
            .ToList();
    }
}
