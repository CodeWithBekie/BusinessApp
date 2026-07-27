using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Tools;
using AiBusinessPlatform.Domain;
using AiBusinessPlatform.Domain.Entities;
using AiBusinessPlatform.Infrastructure.Data;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace AiBusinessPlatform.Infrastructure.Tools;

public class StaffTools(
    AiBusinessPlatformDbContext dbContext, ICurrentTenantProvider tenantProvider, IPasswordHasher<BusinessUser> passwordHasher) : IStaffTools
{
    public async Task<IReadOnlyList<StaffSummary>> ListStaffAsync(Guid businessId, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        return await dbContext.BusinessUsers.AsNoTracking()
            .OrderBy(u => u.CreatedAt)
            .Select(u => new StaffSummary(u.Id, u.Name, u.Email, u.Role, u.IsActive, u.CreatedAt))
            .ToListAsync(cancellationToken);
    }

    public async Task<StaffSummary> InviteStaffAsync(
        Guid businessId, string name, string email, string password, BusinessUserRole role, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }
        if (string.IsNullOrWhiteSpace(name) || string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
        {
            throw new ArgumentException("name, email, and password are required.");
        }

        // Global, not per-business — mirrors AuthEndpoints.Signup's own check (BusinessUser.Email
        // has a table-wide unique index, not scoped per-business).
        var emailTaken = await dbContext.BusinessUsers.IgnoreQueryFilters().AnyAsync(u => u.Email == email, cancellationToken);
        if (emailTaken)
        {
            throw new ArgumentException($"An account with email '{email}' already exists.");
        }

        var staff = new BusinessUser
        {
            Id = Guid.NewGuid(),
            BusinessId = businessId,
            Name = name.Trim(),
            Email = email.Trim(),
            Role = role,
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        };
        staff.PasswordHash = passwordHasher.HashPassword(staff, password);
        dbContext.BusinessUsers.Add(staff);
        await dbContext.SaveChangesAsync(cancellationToken);

        return new StaffSummary(staff.Id, staff.Name, staff.Email, staff.Role, staff.IsActive, staff.CreatedAt);
    }

    public async Task<StaffSummary> UpdateStaffAsync(
        Guid businessId, Guid staffId, Guid callerId, BusinessUserRole? role, bool? isActive, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }
        if (staffId == callerId)
        {
            throw new ArgumentException("You cannot change your own role or active status this way.");
        }

        var staff = await dbContext.BusinessUsers.FirstOrDefaultAsync(u => u.Id == staffId, cancellationToken)
            ?? throw new KeyNotFoundException($"Staff member {staffId} not found.");

        if (role is not null)
        {
            staff.Role = role.Value;
        }
        if (isActive is not null)
        {
            staff.IsActive = isActive.Value;
        }

        await dbContext.SaveChangesAsync(cancellationToken);

        return new StaffSummary(staff.Id, staff.Name, staff.Email, staff.Role, staff.IsActive, staff.CreatedAt);
    }
}
