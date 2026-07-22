namespace AiBusinessPlatform.Api.Contracts;

public record AuthResponse(string Token, Guid BusinessId, Guid BusinessUserId, string Role);
