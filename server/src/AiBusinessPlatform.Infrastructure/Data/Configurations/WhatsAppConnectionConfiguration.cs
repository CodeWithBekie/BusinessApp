using AiBusinessPlatform.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace AiBusinessPlatform.Infrastructure.Data.Configurations;

public class WhatsAppConnectionConfiguration : IEntityTypeConfiguration<WhatsAppConnection>
{
    public void Configure(EntityTypeBuilder<WhatsAppConnection> builder)
    {
        // Ingress resolves business_id directly from the receiving phone number (Section 14) — no ambiguity.
        builder.HasIndex(x => x.PhoneNumberId).IsUnique();
    }
}
