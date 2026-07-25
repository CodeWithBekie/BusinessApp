namespace AiBusinessPlatform.Api.Contracts;

public record CreateSupplierRequest(string Name, string? ContactPhone, string? Email, string? Notes);

public record UpdateSupplierRequest(string? Name, string? ContactPhone, string? Email, string? Notes, bool? Active);
