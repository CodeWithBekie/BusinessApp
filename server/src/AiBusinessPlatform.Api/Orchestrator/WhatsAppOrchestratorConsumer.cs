using System.Text;
using System.Text.Json;
using AiBusinessPlatform.Api.Contracts;
using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Tools;
using AiBusinessPlatform.Domain;
using AiBusinessPlatform.Domain.Entities;
using AiBusinessPlatform.Infrastructure.Data;
using AiBusinessPlatform.Infrastructure.Messaging;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;

namespace AiBusinessPlatform.Api.Orchestrator;

// Section 10.2's "full hosted-service wiring": consumes whatsapp.inbound (published by
// WebhooksEndpoints), persists real Customer/Conversation/Message state, and calls the same
// tool-calling orchestrator design already proven in the OrchestratorHarness console app.
public class WhatsAppOrchestratorConsumer(
    IServiceScopeFactory scopeFactory,
    IChatClient chatClient,
    IOptions<RabbitMqOptions> rabbitOptions,
    ILogger<WhatsAppOrchestratorConsumer> logger) : BackgroundService
{
    private const string QueueName = "whatsapp.inbound";
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

            // Event-driven from here; keep ExecuteAsync alive until the host stops.
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
            logger.LogCritical(ex, "WhatsAppOrchestratorConsumer failed unexpectedly and is stopping.");
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
            var envelope = JsonSerializer.Deserialize<SimulatedWhatsAppMessage>(json)
                ?? throw new InvalidOperationException("Envelope deserialized to null.");

            await using var scope = scopeFactory.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<AiBusinessPlatformDbContext>();
            var catalogTools = scope.ServiceProvider.GetRequiredService<ICatalogTools>();
            var orderTools = scope.ServiceProvider.GetRequiredService<IOrderTools>();
            var tenantProvider = scope.ServiceProvider.GetRequiredService<ICurrentTenantProvider>();

            var customer = await GetOrCreateCustomerAsync(db, tenantProvider, envelope.CustomerNumber, stoppingToken);
            var conversation = await GetOrCreateOpenConversationAsync(db, tenantProvider, customer, stoppingToken);

            db.Messages.Add(new Message
            {
                Id = Guid.NewGuid(),
                BusinessId = tenantProvider.CurrentBusinessId,
                ConversationId = conversation.Id,
                Direction = MessageDirection.Inbound,
                Content = envelope.Text,
                CreatedAt = DateTimeOffset.UtcNow
            });
            await db.SaveChangesAsync(stoppingToken);

            var priorMessages = await db.Messages
                .Where(m => m.ConversationId == conversation.Id)
                .OrderBy(m => m.CreatedAt).ThenBy(m => m.Id)
                .ToListAsync(stoppingToken);

            var history = BuildChatHistory(priorMessages);

            // Rebuilt per message against this scope's tools/tenant — the model only ever
            // supplies itemQuery/itemId/quantity, businessId and customerId always come from the
            // ambient tenant/customer context resolved above, never from the model.
            var checkAvailabilityTool = AIFunctionFactory.Create(
                (string itemQuery) => catalogTools.CheckAvailabilityAsync(tenantProvider.CurrentBusinessId, itemQuery),
                "check_catalog_availability",
                "Finds catalog items matching a free-text query and returns price/stock availability.");

            var reserveStockTool = AIFunctionFactory.Create(
                (Guid itemId, int quantity) => catalogTools.ReserveStockAsync(tenantProvider.CurrentBusinessId, customer.Id, itemId, quantity),
                "reserve_stock",
                "Reserves a quantity of a catalog item for the customer's current order, after they've explicitly confirmed they want to buy it. Decrements available stock immediately.");

            var releaseStockTool = AIFunctionFactory.Create(
                (string itemQuery) => catalogTools.ReleaseStockAsync(tenantProvider.CurrentBusinessId, customer.Id, itemQuery),
                "release_stock_reservation",
                "Cancels a previously reserved item on the customer's current order by name (e.g. \"cement\"), restoring its stock — use this when the customer changed their mind before paying.");

            var createInvoiceTool = AIFunctionFactory.Create(
                () => orderTools.CreateInvoiceAsync(tenantProvider.CurrentBusinessId, customer.Id),
                "create_invoice",
                "Creates the invoice and payment reference for everything the customer has reserved so far. Only call this after the customer has confirmed all items they want and at least one item has been reserved.");

            var requestOrderCancellationTool = AIFunctionFactory.Create(
                (string reason) => orderTools.RequestOrderCancellationApprovalAsync(tenantProvider.CurrentBusinessId, customer.Id, reason),
                "request_order_cancellation",
                "Use when a customer wants to cancel an order or get a refund for an order that has ALREADY been paid. This does NOT cancel or refund anything itself — it escalates the request to the business owner for approval. Tell the customer their request has been escalated and they'll hear back; never say the order has been cancelled, refunded, or approved from this call alone.");

            var chatOptions = new ChatOptions { Tools = [checkAvailabilityTool, reserveStockTool, releaseStockTool, createInvoiceTool, requestOrderCancellationTool] };

            var response = await chatClient.GetResponseAsync(history, chatOptions, stoppingToken);

            LogToolActivity(response);

            db.Messages.Add(new Message
            {
                Id = Guid.NewGuid(),
                BusinessId = tenantProvider.CurrentBusinessId,
                ConversationId = conversation.Id,
                Direction = MessageDirection.Outbound,
                Content = response.Text,
                CreatedAt = DateTimeOffset.UtcNow
            });
            await db.SaveChangesAsync(stoppingToken);

            await _channel!.BasicAckAsync(ea.DeliveryTag, multiple: false, stoppingToken);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed processing whatsapp.inbound delivery {DeliveryTag}", ea.DeliveryTag);
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

    private static async Task<Customer> GetOrCreateCustomerAsync(
        AiBusinessPlatformDbContext db, ICurrentTenantProvider tenantProvider, string customerNumber, CancellationToken ct)
    {
        var customer = await db.Customers.FirstOrDefaultAsync(c => c.WhatsAppNumber == customerNumber, ct);
        if (customer is not null)
        {
            return customer;
        }

        customer = new Customer
        {
            Id = Guid.NewGuid(),
            BusinessId = tenantProvider.CurrentBusinessId,
            WhatsAppNumber = customerNumber,
            CreatedAt = DateTimeOffset.UtcNow
        };
        db.Customers.Add(customer);
        await db.SaveChangesAsync(ct);
        return customer;
    }

    private static async Task<Conversation> GetOrCreateOpenConversationAsync(
        AiBusinessPlatformDbContext db, ICurrentTenantProvider tenantProvider, Customer customer, CancellationToken ct)
    {
        var conversation = await db.Conversations
            .FirstOrDefaultAsync(c => c.CustomerId == customer.Id && c.Status == ConversationStatus.Open, ct);
        if (conversation is not null)
        {
            return conversation;
        }

        conversation = new Conversation
        {
            Id = Guid.NewGuid(),
            BusinessId = tenantProvider.CurrentBusinessId,
            CustomerId = customer.Id,
            WhatsAppThreadId = customer.WhatsAppNumber, // placeholder until real WhatsApp thread IDs exist
            Status = ConversationStatus.Open,
            CreatedAt = DateTimeOffset.UtcNow
        };
        db.Conversations.Add(conversation);
        await db.SaveChangesAsync(ct);
        return conversation;
    }

    private static List<ChatMessage> BuildChatHistory(IReadOnlyList<Message> priorMessages)
    {
        var history = new List<ChatMessage>
        {
            new(ChatRole.System,
                "You are a WhatsApp order-taking assistant for a hardware store, handling the full " +
                "order-to-cash flow. Follow these rules strictly:\n" +
                "1. When a customer asks about an item's availability or price, use check_catalog_availability " +
                "before answering — never guess.\n" +
                "2. Only call reserve_stock after the customer has EXPLICITLY confirmed they want to buy a " +
                "specific item and quantity (e.g. \"yes, 2 bags of cement please\") — never reserve stock " +
                "just because an item was mentioned, asked about, or compared.\n" +
                "3. If reserve_stock reports insufficient stock, tell the customer honestly and offer " +
                "alternatives or a smaller quantity — never claim something is reserved if it wasn't.\n" +
                "4. If the customer wants to remove or cancel an item they already confirmed (before " +
                "paying), call release_stock_reservation with that item's name.\n" +
                "5. Once the customer has confirmed everything they want to order and at least one item is " +
                "reserved, call create_invoice exactly once to generate the total and payment reference. " +
                "Read the total and payment reference back to the customer clearly, and tell them you'll " +
                "confirm once payment is received — do not claim payment is already received.\n" +
                "6. Never mark anything as paid yourself — payment confirmation happens outside this " +
                "conversation. If the customer claims they already paid, tell them you'll check and get " +
                "back to them; do not change any order status based on their claim alone.\n" +
                "7. If a customer wants to cancel an order or requests a refund for an order that has " +
                "ALREADY been paid (not one that's merely quoted/invoiced-but-unpaid — for those, use " +
                "release_stock_reservation), call request_order_cancellation with a brief reason. Never " +
                "attempt to cancel, refund, or change the status of a paid order yourself. Tell the " +
                "customer you've escalated their request to the business owner and they'll hear back " +
                "with a decision — never say it's been cancelled, refunded, or approved. If they ask " +
                "for an update on a previously-escalated request, tell them you'll check and get back " +
                "to them; do not guess or claim a decision has been made.\n" +
                "8. Be concise, like a real WhatsApp reply.")
        };

        history.AddRange(priorMessages.Select(m => new ChatMessage(
            m.Direction == MessageDirection.Inbound ? ChatRole.User : ChatRole.Assistant,
            m.Content)));

        return history;
    }

    private void LogToolActivity(ChatResponse response)
    {
        foreach (var message in response.Messages)
        {
            foreach (var content in message.Contents)
            {
                switch (content)
                {
                    case FunctionCallContent call:
                        var callArgs = call.Arguments is null
                            ? string.Empty
                            : string.Join(", ", call.Arguments.Select(kv => $"{kv.Key}={JsonSerializer.Serialize(kv.Value)}"));
                        logger.LogInformation("[tool call] {Name}({Args})", call.Name, callArgs);
                        break;
                    case FunctionResultContent result:
                        logger.LogInformation("[tool result] {Result}", JsonSerializer.Serialize(result.Result));
                        break;
                }
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
