using AiBusinessPlatform.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AiBusinessPlatform.Infrastructure.Data.Configurations;

public class PaynowConnectionConfiguration : IEntityTypeConfiguration<PaynowConnection>
{
    public void Configure(EntityTypeBuilder<PaynowConnection> builder)
    {
        // One Paynow connection per business, like WhatsAppConnection.
        builder.HasIndex(x => x.BusinessId).IsUnique();
    }
}
