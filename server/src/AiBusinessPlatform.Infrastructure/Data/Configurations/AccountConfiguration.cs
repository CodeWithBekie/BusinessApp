using AiBusinessPlatform.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AiBusinessPlatform.Infrastructure.Data.Configurations;

public class AccountConfiguration : IEntityTypeConfiguration<Account>
{
    public void Configure(EntityTypeBuilder<Account> builder)
    {
        builder.HasIndex(x => x.BusinessId);
        builder.HasIndex(x => new { x.BusinessId, x.Code }).IsUnique();

        builder.HasOne<Business>().WithMany().HasForeignKey(x => x.BusinessId).OnDelete(DeleteBehavior.Restrict);
    }
}
