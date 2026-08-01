using System.ComponentModel;
using AiBusinessPlatform.Domain;

namespace AiBusinessPlatform.Application.Tools;

public record SupplierSummary(Guid Id, string Name, string? ContactPhone, string? Email, string? Notes, SupplierCategory? Category, int? Rating, bool Active, DateTimeOffset CreatedAt);

// New ground, not a spec section — lets a business record who it restocks from and place
// IPurchaseOrderTools purchase orders against them, shared by the dashboard REST endpoints and the
// MCP/Assistant tools (Section 10.2/10.7's "one function, multiple entry points").
public interface ISupplierTools
{
    [Description("Searches this business's suppliers by name, most recently created first. Omit search to list all.")]
    Task<IReadOnlyList<SupplierSummary>> ListSuppliersAsync(Guid businessId, string? search, CancellationToken cancellationToken = default);

    [Description("Adds a new supplier this business buys stock from.")]
    Task<SupplierSummary> CreateSupplierAsync(Guid businessId, string name, string? contactPhone, string? email, string? notes, SupplierCategory? category, int? rating, CancellationToken cancellationToken = default);

    [Description("Edits an existing supplier's details. Only the fields provided are changed; omit a field to leave it as-is. Set active=false to retire a supplier you no longer buy from. Rating must be 1-5.")]
    Task<SupplierSummary> UpdateSupplierAsync(Guid businessId, Guid supplierId, string? name, string? contactPhone, string? email, string? notes, SupplierCategory? category, int? rating, bool? active, CancellationToken cancellationToken = default);
}
