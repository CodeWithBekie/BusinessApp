namespace AiBusinessPlatform.Infrastructure.Messaging;

public class RabbitMqOptions
{
    public const string SectionName = "RabbitMq";

    public string HostName { get; set; } = "localhost";
    public int Port { get; set; } = 5673; // remapped host port, see infra/docker-compose.yml
    public string UserName { get; set; } = "aibp";
    public string Password { get; set; } = "devpassword";
}
