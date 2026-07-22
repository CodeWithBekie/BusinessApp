namespace AiBusinessPlatform.Infrastructure.WhatsApp;

public class WhatsAppSendException(string message, string? responseBody = null) : Exception(message)
{
    public string? ResponseBody { get; } = responseBody;
}
