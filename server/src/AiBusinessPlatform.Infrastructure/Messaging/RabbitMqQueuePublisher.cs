using System.Text;
using AiBusinessPlatform.Application.Abstractions;
using Microsoft.Extensions.Options;
using RabbitMQ.Client;

namespace AiBusinessPlatform.Infrastructure.Messaging;

public class RabbitMqQueuePublisher(IOptions<RabbitMqOptions> options) : IQueuePublisher, IAsyncDisposable
{
    private readonly RabbitMqOptions _options = options.Value;
    private readonly SemaphoreSlim _initLock = new(1, 1);
    private IConnection? _connection;
    private IChannel? _channel;

    public async Task PublishAsync(string queueName, string payload, CancellationToken cancellationToken = default)
    {
        var channel = await GetChannelAsync(cancellationToken);
        await channel.QueueDeclareAsync(queue: queueName, durable: true, exclusive: false, autoDelete: false, cancellationToken: cancellationToken);

        var body = Encoding.UTF8.GetBytes(payload);
        await channel.BasicPublishAsync(exchange: string.Empty, routingKey: queueName, body: body, cancellationToken: cancellationToken);
    }

    private async Task<IChannel> GetChannelAsync(CancellationToken cancellationToken)
    {
        if (_channel is { IsOpen: true }) return _channel;

        await _initLock.WaitAsync(cancellationToken);
        try
        {
            if (_channel is { IsOpen: true }) return _channel;

            var factory = new ConnectionFactory
            {
                HostName = _options.HostName,
                Port = _options.Port,
                UserName = _options.UserName,
                Password = _options.Password
            };

            _connection = await factory.CreateConnectionAsync(cancellationToken);
            _channel = await _connection.CreateChannelAsync(cancellationToken: cancellationToken);
            return _channel;
        }
        finally
        {
            _initLock.Release();
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (_channel is not null) await _channel.CloseAsync();
        if (_connection is not null) await _connection.CloseAsync();
    }
}
