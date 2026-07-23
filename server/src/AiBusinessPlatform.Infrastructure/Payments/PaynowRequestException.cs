namespace AiBusinessPlatform.Infrastructure.Payments;

public class PaynowRequestException(string message, string? responseBody = null) : Exception(message)
{
    public string? ResponseBody { get; } = responseBody;
}
