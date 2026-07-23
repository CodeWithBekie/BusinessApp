using System.Text;
using System.Text.Json;
using AiBusinessPlatform.Api.Contracts;
using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Tools;
using AiBusinessPlatform.Infrastructure.Messaging;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;

namespace AiBusinessPlatform.Api.Payments;

// Consumes payments.confirmed — a single, provider-agnostic queue both the simulated
// /webhooks/payments/manual endpoint and the real /webhooks/payments/paynow endpoint publish to,
// each having already resolved BusinessId themselves (Section 9.3). Mirrors
// WhatsAppOrchestratorConsumer's connection/resilience pattern.
public class PaymentWebhookConsumer(
    IServiceScopeFactory scopeFactory,
    IOptions<RabbitMqOptions> rabbitOptions,
    ILogger<PaymentWebhookConsumer> logger) : BackgroundService
{
    private const string QueueName = "payments.confirmed";
    private readonly RabbitMqOptions _options = rabbitOptions.Value;
    private IConnection? _connection;
    private IChannel? _channel;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await ConnectWithRetryAsync(stoppingToken);
            if (stoppingToken.IsCancellationRequested)
            {
                return;
            }

            await _channel!.BasicQosAsync(0, prefetchCount: 1, global: false, stoppingToken);
            await _channel.QueueDeclareAsync(QueueName, durable: true, exclusive: false, autoDelete: false, cancellationToken: stoppingToken);

            var consumer = new AsyncEventingBasicConsumer(_channel);
            consumer.ReceivedAsync += async (_, ea) => await HandleMessageAsync(ea, stoppingToken);

            await _channel.BasicConsumeAsync(QueueName, autoAck: false, consumer, stoppingToken);
            logger.LogInformation("Listening on RabbitMQ queue '{Queue}'", QueueName);

            await Task.Delay(Timeout.Infinite, stoppingToken);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Normal shutdown.
        }
        catch (Exception ex)
        {
            // Never let this escape ExecuteAsync — BackgroundServiceExceptionBehavior defaults to
            // StopHost, which would crash the whole webhook Api, not just this consumer.
            logger.LogCritical(ex, "PaymentWebhookConsumer failed unexpectedly and is stopping.");
        }
    }

    private async Task ConnectWithRetryAsync(CancellationToken stoppingToken)
    {
        var delay = TimeSpan.FromSeconds(1);
        var maxDelay = TimeSpan.FromSeconds(30);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var factory = new ConnectionFactory
                {
                    HostName = _options.HostName,
                    Port = _options.Port,
                    UserName = _options.UserName,
                    Password = _options.Password
                };

                _connection = await factory.CreateConnectionAsync(stoppingToken);
                _channel = await _connection.CreateChannelAsync(cancellationToken: stoppingToken);
                logger.LogInformation("Connected to RabbitMQ at {HostName}:{Port}", _options.HostName, _options.Port);
                return;
            }
            catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
            {
                logger.LogWarning(ex, "Failed to connect to RabbitMQ, retrying in {Delay}", delay);
                try
                {
                    await Task.Delay(delay, stoppingToken);
                }
                catch (OperationCanceledException)
                {
                    return;
                }

                delay = TimeSpan.FromSeconds(Math.Min(delay.TotalSeconds * 2, maxDelay.TotalSeconds));
            }
        }
    }

    private async Task HandleMessageAsync(BasicDeliverEventArgs ea, CancellationToken stoppingToken)
    {
        try
        {
            var json = Encoding.UTF8.GetString(ea.Body.Span); // copy now — Body is only valid during this callback
            var envelope = JsonSerializer.Deserialize<PaymentConfirmedQueueMessage>(json)
                ?? throw new InvalidOperationException("Envelope deserialized to null.");

            await using var scope = scopeFactory.CreateAsyncScope();
            var orderTools = scope.ServiceProvider.GetRequiredService<IOrderTools>();
            var tenantProvider = scope.ServiceProvider.GetRequiredService<ICurrentTenantProvider>();
            var tenantSetter = scope.ServiceProvider.GetRequiredService<ICurrentTenantSetter>();

            // Must happen before any other scoped service resolves/uses tenantProvider — there's
            // no HttpContext here, so BusinessId (already resolved once at webhook ingress) has
            // to be pushed in explicitly rather than inferred.
            tenantSetter.SetBusinessId(envelope.BusinessId);

            var result = await orderTools.ConfirmPaymentAsync(tenantProvider.CurrentBusinessId, envelope.OrderId, stoppingToken);
            logger.LogInformation(
                "[payment confirmed] order={OrderId} payment={PaymentId} orderStatus={OrderStatus} paymentStatus={PaymentStatus}",
                result.OrderId, result.PaymentId, result.OrderStatus, result.PaymentStatus);

            await _channel!.BasicAckAsync(ea.DeliveryTag, multiple: false, stoppingToken);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed processing payments.confirmed delivery {DeliveryTag}", ea.DeliveryTag);
            try
            {
                // No dead-letter queue yet (known gap, follow-up pass) — drop rather than
                // requeue-loop forever.
                await _channel!.BasicNackAsync(ea.DeliveryTag, multiple: false, requeue: false, stoppingToken);
            }
            catch (Exception nackEx)
            {
                logger.LogError(nackEx, "Failed to nack delivery {DeliveryTag}", ea.DeliveryTag);
            }
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        if (_channel is not null)
        {
            await _channel.CloseAsync();
        }

        if (_connection is not null)
        {
            await _connection.CloseAsync();
        }

        await base.StopAsync(cancellationToken);
    }
}
