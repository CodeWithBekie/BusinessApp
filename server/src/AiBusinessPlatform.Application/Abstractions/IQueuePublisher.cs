namespace AiBusinessPlatform.Application.Abstractions;

// Section 9.3 — inbound messages and payment webhooks go through a queue, not a direct synchronous
// handler, so a slow AI response or downstream outage doesn't drop messages. RabbitMQ backs this
// locally (Infrastructure.Messaging.RabbitMqQueuePublisher); production may swap to Azure Service Bus
// behind this same interface (Section 17).
public interface IQueuePublisher
{
    Task PublishAsync(string queueName, string payload, CancellationToken cancellationToken = default);
}
