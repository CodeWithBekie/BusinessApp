namespace AiBusinessPlatform.Api.Contracts;

public record CustomerSignupRequest(string Email, string Password, string? Name, string? PhoneNumber);

public record CustomerLoginRequest(string Email, string Password);

public record CustomerAuthResponse(string Token, Guid CustomerAccountId, string Email, string? Name);
