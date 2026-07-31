namespace AiBusinessPlatform.Api.Contracts;

public record EcoCashConnectRequest(
    string Username, string Password, string MerchantCode, string MerchantPin, string MerchantNumber,
    string MerchantName, string SuperMerchantName, string? CountryCode, string? TerminalId, string? Location);
