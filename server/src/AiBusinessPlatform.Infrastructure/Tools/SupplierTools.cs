using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Tools;
using AiBusinessPlatform.Domain.Entities;
using AiBusinessPlatform.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace AiBusinessPlatform.Infrastructure.Tools;

public class SupplierTools(AiBusinessPlatformDbContext dbContext, ICurrentTenantProvider tenantProvider) : ISupplierTools
{
    private static SupplierSummary ToSummary(Supplier s) => new(s.Id, s.Name, s.ContactPhone, s.Email, s.Notes, s.Active, s.CreatedAt);

    public async Task<IReadOnlyList<SupplierSummary>> ListSuppliersAsync(Guid businessId, string? search, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        var query = dbContext.Suppliers.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var trimmed = search.Trim();
            query = query.Where(s => EF.Functions.ILike(s.Name, $"%{trimmed}%"));
        }

        var suppliers = await query.OrderByDescending(s => s.CreatedAt).ToListAsync(cancellationToken);
        return suppliers.Select(ToSummary).ToList();
    }

    public async Task<SupplierSummary> CreateSupplierAsync(
        Guid businessId, string name, string? contactPhone, string? email, string? notes, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }
        if (string.IsNullOrWhiteSpace(name))
        {
            throw new ArgumentException("name is required.", nameof(name));
        }

        var supplier = new Supplier
        {
            Id = Guid.NewGuid(),
            BusinessId = tenantProvider.CurrentBusinessId,
            Name = name.Trim(),
            ContactPhone = string.IsNullOrWhiteSpace(contactPhone) ? null : contactPhone.Trim(),
            Email = string.IsNullOrWhiteSpace(email) ? null : email.Trim(),
            Notes = string.IsNullOrWhiteSpace(notes) ? null : notes.Trim(),
            Active = true,
            CreatedAt = DateTimeOffset.UtcNow
        };
        dbContext.Suppliers.Add(supplier);
        await dbContext.SaveChangesAsync(cancellationToken);

        return ToSummary(supplier);
    }

    public async Task<SupplierSummary> UpdateSupplierAsync(
        Guid businessId, Guid supplierId, string? name, string? contactPhone, string? email, string? notes, bool? active,
        CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        var supplier = await dbContext.Suppliers.FirstOrDefaultAsync(s => s.Id == supplierId, cancellationToken)
            ?? throw new KeyNotFoundException($"Supplier {supplierId} not found.");

        if (name is not null)
        {
            if (string.IsNullOrWhiteSpace(name))
            {
                throw new ArgumentException("name cannot be blank.", nameof(name));
            }
            supplier.Name = name.Trim();
        }
        if (contactPhone is not null)
        {
            supplier.ContactPhone = string.IsNullOrWhiteSpace(contactPhone) ? null : contactPhone.Trim();
        }
        if (email is not null)
        {
            supplier.Email = string.IsNullOrWhiteSpace(email) ? null : email.Trim();
        }
        if (notes is not null)
        {
            supplier.Notes = string.IsNullOrWhiteSpace(notes) ? null : notes.Trim();
        }
        if (active is not null)
        {
            supplier.Active = active.Value;
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return ToSummary(supplier);
    }
}
