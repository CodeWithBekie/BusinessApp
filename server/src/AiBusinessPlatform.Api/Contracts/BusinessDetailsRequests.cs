namespace AiBusinessPlatform.Api.Contracts;

public record BusinessDetailsResponse(
    string Name, string? Tin, string? VatNumber, string? Address, string? Email, string? Phone,
    decimal VatRate, string? DeviceSerialNumber, string? FiscalDeviceId);

public record UpdateBusinessDetailsRequest(
    string? Tin, string? VatNumber, string? Address, string? Email, string? Phone,
    decimal VatRate, string? DeviceSerialNumber, string? FiscalDeviceId);
