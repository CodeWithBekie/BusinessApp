using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Domain;
using AiBusinessPlatform.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace AiBusinessPlatform.Api.Orchestrator;

// No new RabbitMQ dead-letter/delay-queue topology — a DB-backed poll fits the existing EF Core
// patterns better and reuses the persisted failure record IWhatsAppMessageService already writes.
// Scans across all tenants (IgnoreQueryFilters) for outbound Messages whose send failed and are
// due for another attempt, then retries each one with that message's own tenant context set (same
// ICurrentTenantSetter pattern WhatsAppOrchestratorConsumer/PaymentWebhookConsumer already use for
// background/non-HTTP processing).
public class WhatsAppRetryHostedService(IServiceScopeFactory scopeFactory, ILogger<WhatsAppRetryHostedService> logger) : BackgroundService
{
    private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(60);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(PollInterval);
        do
        {
            try
            {
                await RetryDueMessagesAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                // Never let a scan failure crash the host — just log and try again next tick.
                logger.LogError(ex, "WhatsAppRetryHostedService failed to process due retries this tick.");
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    private async Task RetryDueMessagesAsync(CancellationToken stoppingToken)
    {
        List<DueMessage> due;
        await using (var scanScope = scopeFactory.CreateAsyncScope())
        {
            var db = scanScope.ServiceProvider.GetRequiredService<AiBusinessPlatformDbContext>();
            var now = DateTimeOffset.UtcNow;
            due = await db.Messages.IgnoreQueryFilters()
                .Where(m => m.Direction == MessageDirection.Outbound && m.Status == MessageDeliveryStatus.Failed
                    && m.NextAttemptAt != null && m.NextAttemptAt <= now)
                .Select(m => new DueMessage(m.Id, m.BusinessId))
                .ToListAsync(stoppingToken);
        }

        foreach (var message in due)
        {
            await using var scope = scopeFactory.CreateAsyncScope();
            var tenantSetter = scope.ServiceProvider.GetRequiredService<ICurrentTenantSetter>();
            var whatsAppMessageService = scope.ServiceProvider.GetRequiredService<IWhatsAppMessageService>();

            // Must happen before any other scoped service resolves/uses the tenant provider —
            // there's no HttpContext here, so BusinessId has to be pushed in explicitly.
            tenantSetter.SetBusinessId(message.BusinessId);

            try
            {
                await whatsAppMessageService.RetryMessageAsync(message.Id, stoppingToken);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Retry attempt threw for Message {MessageId} — will retry again if still due.", message.Id);
            }
        }
    }

    private record DueMessage(Guid Id, Guid BusinessId);
}
