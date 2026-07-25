using System.Text.Json;
using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Tools;
using AiBusinessPlatform.Domain;
using AiBusinessPlatform.Domain.Entities;
using AiBusinessPlatform.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace AiBusinessPlatform.Infrastructure.Tools;

public class CatalogTools(AiBusinessPlatformDbContext dbContext, ICurrentTenantProvider tenantProvider) : ICatalogTools
{
    public async Task<IReadOnlyList<CatalogAvailabilityMatch>> CheckAvailabilityAsync(Guid businessId, string itemQuery, CancellationToken cancellationToken = default)
    {
        // The DbContext's global query filter already scopes CatalogItems to the ambient tenant
        // (Section 11); this check catches a caller ever passing a mismatched businessId instead
        // of silently trusting or silently ignoring it (Section 11/14's isolation guarantee should
        // fail loud, not fail quiet).
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        var trimmedQuery = itemQuery.Trim();

        var items = await dbContext.CatalogItems
            .Where(i => i.Active && EF.Functions.ILike(i.Name, $"%{trimmedQuery}%"))
            .ToListAsync(cancellationToken);

        return items
            .Select(i => new CatalogAvailabilityMatch(i.Id, i.Name, i.Price, i.Currency, i.StockQuantity))
            .ToList();
    }

    // Reservation model (no dedicated schema table — see ICatalogTools.cs): "reserve" decrements
    // stock immediately and creates/updates an Order (Quoted) + OrderItem; OrderItem.Id doubles as
    // the ReservationId. Repeated reservations of the same item on an open order merge into one
    // line rather than duplicating.
    public async Task<ReserveStockResult> ReserveStockAsync(Guid businessId, Guid customerId, Guid itemId, int quantity, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        var catalogItem = await dbContext.CatalogItems.FirstOrDefaultAsync(c => c.Id == itemId, cancellationToken);
        if (catalogItem is null)
        {
            return new ReserveStockResult(Guid.Empty, false, "Item not found.");
        }

        if (catalogItem.StockQuantity is not null && catalogItem.StockQuantity < quantity)
        {
            return new ReserveStockResult(Guid.Empty, false, $"Only {catalogItem.StockQuantity} in stock, requested {quantity}.");
        }

        var order = await dbContext.Orders.FirstOrDefaultAsync(o => o.CustomerId == customerId && o.Status == OrderStatus.Quoted, cancellationToken);
        if (order is null)
        {
            order = new Order
            {
                Id = Guid.NewGuid(),
                BusinessId = tenantProvider.CurrentBusinessId,
                CustomerId = customerId,
                Status = OrderStatus.Quoted,
                Currency = catalogItem.Currency,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow
            };
            dbContext.Orders.Add(order);
        }

        var orderItem = await dbContext.OrderItems.FirstOrDefaultAsync(oi => oi.OrderId == order.Id && oi.CatalogItemId == itemId, cancellationToken);
        if (orderItem is null)
        {
            orderItem = new OrderItem
            {
                Id = Guid.NewGuid(),
                BusinessId = tenantProvider.CurrentBusinessId,
                OrderId = order.Id,
                CatalogItemId = itemId,
                Quantity = quantity,
                UnitPrice = catalogItem.Price,
                Subtotal = catalogItem.Price * quantity
            };
            dbContext.OrderItems.Add(orderItem);
        }
        else
        {
            orderItem.Quantity += quantity;
            orderItem.Subtotal += catalogItem.Price * quantity;
        }

        if (catalogItem.StockQuantity is not null)
        {
            catalogItem.StockQuantity -= quantity;
        }
        catalogItem.UpdatedAt = DateTimeOffset.UtcNow;

        order.TotalAmount += catalogItem.Price * quantity;
        order.UpdatedAt = DateTimeOffset.UtcNow;

        await dbContext.SaveChangesAsync(cancellationToken);

        return new ReserveStockResult(orderItem.Id, true, null);
    }

    public async Task FinalizeStockAsync(Guid businessId, Guid reservationId, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        // Stock was already decremented at reserve time (see class remarks above) — this is just a
        // validation checkpoint before payment confirmation proceeds, kept for interface
        // completeness / a future real MCP caller, not a second decrement.
        var exists = await dbContext.OrderItems.AnyAsync(oi => oi.Id == reservationId, cancellationToken);
        if (!exists)
        {
            throw new InvalidOperationException($"Reservation {reservationId} not found — cannot finalize.");
        }
    }

    public async Task<ReserveStockResult> ReleaseStockAsync(Guid businessId, Guid customerId, string itemQuery, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        var order = await dbContext.Orders.FirstOrDefaultAsync(o => o.CustomerId == customerId && o.Status == OrderStatus.Quoted, cancellationToken);
        if (order is null)
        {
            return new ReserveStockResult(Guid.Empty, false, "There's no open order to cancel anything from.");
        }

        var orderItems = await dbContext.OrderItems.Where(oi => oi.OrderId == order.Id).ToListAsync(cancellationToken);
        var catalogItemIds = orderItems.Select(oi => oi.CatalogItemId).ToList();
        var catalogItems = await dbContext.CatalogItems
            .Where(c => catalogItemIds.Contains(c.Id))
            .ToDictionaryAsync(c => c.Id, cancellationToken);

        var trimmedQuery = itemQuery.Trim();
        var orderItem = orderItems.FirstOrDefault(oi =>
            catalogItems.TryGetValue(oi.CatalogItemId, out var c) && c.Name.Contains(trimmedQuery, StringComparison.OrdinalIgnoreCase));

        if (orderItem is null)
        {
            return new ReserveStockResult(Guid.Empty, false, $"No reserved item matching \"{itemQuery}\" found on the current order.");
        }

        var catalogItem = catalogItems[orderItem.CatalogItemId];
        if (catalogItem.StockQuantity is not null)
        {
            catalogItem.StockQuantity += orderItem.Quantity;
            catalogItem.UpdatedAt = DateTimeOffset.UtcNow;
        }

        order.TotalAmount -= orderItem.Subtotal;
        order.UpdatedAt = DateTimeOffset.UtcNow;

        var releasedItemId = orderItem.Id;
        var previousOrderStatus = order.Status;
        dbContext.OrderItems.Remove(orderItem);

        // If that was the order's only item, cancel the order rather than leaving an empty Quoted shell.
        var remainingItems = await dbContext.OrderItems.CountAsync(oi => oi.OrderId == order.Id && oi.Id != releasedItemId, cancellationToken);
        if (remainingItems == 0)
        {
            order.Status = OrderStatus.Cancelled;

            dbContext.AuditLogs.Add(new AuditLog
            {
                Id = Guid.NewGuid(),
                BusinessId = tenantProvider.CurrentBusinessId,
                ActorType = AuditActorType.System,
                ActorId = "ai-orchestrator",
                Action = "order.cancellation.released",
                EntityType = nameof(Order),
                EntityId = order.Id.ToString(),
                BeforeStateJson = JsonSerializer.Serialize(new { Status = previousOrderStatus.ToString() }),
                AfterStateJson = JsonSerializer.Serialize(new { Status = order.Status.ToString() }),
                CreatedAt = DateTimeOffset.UtcNow
            });
        }

        await dbContext.SaveChangesAsync(cancellationToken);

        return new ReserveStockResult(releasedItemId, true, null);
    }

    public async Task<IReadOnlyList<CatalogItemSummary>> ListCatalogItemsAsync(Guid businessId, bool? activeOnly, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        var query = dbContext.CatalogItems.AsNoTracking().AsQueryable();
        if (activeOnly == true)
        {
            query = query.Where(c => c.Active);
        }

        var items = await query.OrderBy(c => c.Name).ToListAsync(cancellationToken);
        return items.Select(ToSummary).ToList();
    }

    public async Task<CatalogItemSummary> CreateCatalogItemAsync(
        Guid businessId, string name, CatalogItemType itemType, decimal price, string? currency, int? stockQuantity, string? unit,
        CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }
        if (string.IsNullOrWhiteSpace(name))
        {
            throw new ArgumentException("name is required.", nameof(name));
        }
        if (price < 0)
        {
            throw new ArgumentException("price cannot be negative.", nameof(price));
        }
        if (stockQuantity is < 0)
        {
            throw new ArgumentException("stockQuantity cannot be negative.", nameof(stockQuantity));
        }

        var item = new CatalogItem
        {
            Id = Guid.NewGuid(),
            BusinessId = tenantProvider.CurrentBusinessId,
            Name = name.Trim(),
            ItemType = itemType,
            Price = price,
            Currency = string.IsNullOrWhiteSpace(currency) ? "USD" : currency.Trim(),
            StockQuantity = itemType == CatalogItemType.Stock ? stockQuantity ?? 0 : null,
            Unit = string.IsNullOrWhiteSpace(unit) ? "each" : unit.Trim(),
            Active = true,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        dbContext.CatalogItems.Add(item);
        await dbContext.SaveChangesAsync(cancellationToken);

        return ToSummary(item);
    }

    public async Task<CatalogItemSummary> UpdateCatalogItemAsync(
        Guid businessId, Guid itemId, string? name, decimal? price, string? currency, int? stockQuantity, string? unit, bool? active,
        CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        var item = await dbContext.CatalogItems.FirstOrDefaultAsync(c => c.Id == itemId, cancellationToken)
            ?? throw new KeyNotFoundException($"Catalog item {itemId} not found.");

        if (name is not null)
        {
            if (string.IsNullOrWhiteSpace(name))
            {
                throw new ArgumentException("name cannot be blank.", nameof(name));
            }
            item.Name = name.Trim();
        }
        if (price is not null)
        {
            if (price < 0)
            {
                throw new ArgumentException("price cannot be negative.", nameof(price));
            }
            item.Price = price.Value;
        }
        if (currency is not null)
        {
            item.Currency = string.IsNullOrWhiteSpace(currency) ? item.Currency : currency.Trim();
        }
        if (stockQuantity is not null)
        {
            if (stockQuantity < 0)
            {
                throw new ArgumentException("stockQuantity cannot be negative.", nameof(stockQuantity));
            }
            item.StockQuantity = stockQuantity;
        }
        if (unit is not null)
        {
            item.Unit = string.IsNullOrWhiteSpace(unit) ? item.Unit : unit.Trim();
        }
        if (active is not null)
        {
            item.Active = active.Value;
        }

        item.UpdatedAt = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);

        return ToSummary(item);
    }

    private static CatalogItemSummary ToSummary(CatalogItem item) => new(
        item.Id, item.Name, item.ItemType, item.Price, item.Currency,
        item.StockQuantity, item.Unit, item.Active, item.CreatedAt, item.UpdatedAt);
}
