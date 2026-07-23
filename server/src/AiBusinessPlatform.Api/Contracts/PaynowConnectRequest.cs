namespace AiBusinessPlatform.Api.Contracts;

public record PaynowConnectRequest(string IntegrationId, string IntegrationKey, string NotificationEmail);
