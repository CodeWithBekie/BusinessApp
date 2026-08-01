using AiBusinessPlatform.Domain;

namespace AiBusinessPlatform.Api.Contracts;

public record CreateSupplierRequest(string Name, string? ContactPhone, string? Email, string? Notes, SupplierCategory? Category, int? Rating);

public record UpdateSupplierRequest(string? Name, string? ContactPhone, string? Email, string? Notes, SupplierCategory? Category, int? Rating, bool? Active);
