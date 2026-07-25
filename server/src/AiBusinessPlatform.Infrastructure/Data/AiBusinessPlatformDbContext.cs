using System.Reflection;
using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Domain;
using AiBusinessPlatform.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace AiBusinessPlatform.Infrastructure.Data;

public class AiBusinessPlatformDbContext : DbContext
{
    private readonly ICurrentTenantProvider _tenantProvider;

    public AiBusinessPlatformDbContext(
        DbContextOptions<AiBusinessPlatformDbContext> options,
        ICurrentTenantProvider tenantProvider) : base(options)
    {
        _tenantProvider = tenantProvider;
    }

    public DbSet<Business> Businesses => Set<Business>();
    public DbSet<BusinessUser> BusinessUsers => Set<BusinessUser>();
    public DbSet<CatalogItem> CatalogItems => Set<CatalogItem>();
    public DbSet<TimeSlot> TimeSlots => Set<TimeSlot>();
    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<CustomerAccount> CustomerAccounts => Set<CustomerAccount>();
    public DbSet<Conversation> Conversations => Set<Conversation>();
    public DbSet<Message> Messages => Set<Message>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderItem> OrderItems => Set<OrderItem>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<Delivery> Deliveries => Set<Delivery>();
    public DbSet<PendingApproval> PendingApprovals => Set<PendingApproval>();
    public DbSet<Document> Documents => Set<Document>();
    public DbSet<DocumentChunk> DocumentChunks => Set<DocumentChunk>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<WhatsAppConnection> WhatsAppConnections => Set<WhatsAppConnection>();
    public DbSet<PaynowConnection> PaynowConnections => Set<PaynowConnection>();
    public DbSet<McpIntegrationAccount> McpIntegrationAccounts => Set<McpIntegrationAccount>();
    public DbSet<Supplier> Suppliers => Set<Supplier>();
    public DbSet<PurchaseOrder> PurchaseOrders => Set<PurchaseOrder>();
    public DbSet<PurchaseOrderItem> PurchaseOrderItems => Set<PurchaseOrderItem>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasPostgresExtension("vector");

        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AiBusinessPlatformDbContext).Assembly);

        // Section 11 isolation rule: every tenant-scoped table is filtered by business_id automatically,
        // rather than left to individual query authors.
        foreach (var entityType in modelBuilder.Model.GetEntityTypes())
        {
            if (typeof(ITenantScoped).IsAssignableFrom(entityType.ClrType))
            {
                SetTenantFilterMethod.MakeGenericMethod(entityType.ClrType).Invoke(this, [modelBuilder]);
            }
        }

        base.OnModelCreating(modelBuilder);
    }

    private static readonly MethodInfo SetTenantFilterMethod =
        typeof(AiBusinessPlatformDbContext).GetMethod(nameof(SetTenantFilter), BindingFlags.NonPublic | BindingFlags.Instance)!;

    private void SetTenantFilter<TEntity>(ModelBuilder modelBuilder) where TEntity : class, ITenantScoped
    {
        modelBuilder.Entity<TEntity>().HasQueryFilter(e => e.BusinessId == _tenantProvider.CurrentBusinessId);
    }
}
