using System.Text.Json;
using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Tools;
using AiBusinessPlatform.Domain;
using AiBusinessPlatform.Domain.Entities;
using AiBusinessPlatform.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace AiBusinessPlatform.Infrastructure.Tools;

public class PurchaseOrderTools(AiBusinessPlatformDbContext dbContext, ICurrentTenantProvider tenantProvider, ICatalogTools catalogTools) : IPurchaseOrderTools
{
    public async Task<IReadOnlyList<PurchaseOrderSummary>> ListPurchaseOrdersAsync(Guid businessId, PurchaseOrderStatus? status, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        var query =
            from po in dbContext.PurchaseOrders.AsNoTracking()
            join s in dbContext.Suppliers.AsNoTracking() on po.SupplierId equals s.Id
            select new { po, s };

        if (status is not null)
        {
            query = query.Where(x => x.po.Status == status);
        }

        return await query
            .OrderByDescending(x => x.po.CreatedAt)
            .Select(x => new PurchaseOrderSummary(
                x.po.Id, x.s.Id, x.s.Name, x.po.Status, x.po.TotalAmount, x.po.Currency,
                dbContext.PurchaseOrderItems.Count(i => i.PurchaseOrderId == x.po.Id),
                x.po.CreatedAt, x.po.UpdatedAt, x.po.ReceivedAt))
            .ToListAsync(cancellationToken);
    }

    public async Task<PurchaseOrderDetail> GetPurchaseOrderAsync(Guid businessId, Guid purchaseOrderId, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        var po = await dbContext.PurchaseOrders.AsNoTracking().FirstOrDefaultAsync(p => p.Id == purchaseOrderId, cancellationToken)
            ?? throw new KeyNotFoundException($"Purchase order {purchaseOrderId} not found.");

        var supplier = await dbContext.Suppliers.AsNoTracking().FirstOrDefaultAsync(s => s.Id == po.SupplierId, cancellationToken);

        var items = await (
            from poi in dbContext.PurchaseOrderItems.AsNoTracking()
            join ci in dbContext.CatalogItems.AsNoTracking() on poi.CatalogItemId equals ci.Id into ciJoin
            from ci in ciJoin.DefaultIfEmpty()
            where poi.PurchaseOrderId == po.Id
            select new PurchaseOrderItemSummary(
                poi.Id,
                poi.CatalogItemId,
                ci != null ? ci.Name : (poi.NewItemName ?? "Unknown item"),
                poi.CatalogItemId == null,
                ci != null ? ci.Price : (decimal?)null,
                poi.Quantity, poi.UnitCost, poi.Subtotal)
        ).ToListAsync(cancellationToken);

        return new PurchaseOrderDetail(
            po.Id, po.SupplierId, supplier?.Name ?? "Unknown supplier", po.Status, po.TotalAmount, po.Currency, items,
            po.CreatedAt, po.UpdatedAt, po.ReceivedAt);
    }

    public async Task<PurchaseOrderDetail> CreatePurchaseOrderAsync(
        Guid businessId, Guid supplierId, IReadOnlyList<PurchaseOrderLineItem> items, string? currency, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }
        if (items.Count == 0)
        {
            throw new ArgumentException("At least one item is required.", nameof(items));
        }

        var supplier = await dbContext.Suppliers.FirstOrDefaultAsync(s => s.Id == supplierId, cancellationToken)
            ?? throw new ArgumentException($"Supplier {supplierId} not found.", nameof(supplierId));
        if (!supplier.Active)
        {
            throw new ArgumentException("Supplier is not active.", nameof(supplierId));
        }

        var catalogItemIds = items.Where(i => i.CatalogItemId is not null).Select(i => i.CatalogItemId!.Value).Distinct().ToList();
        var catalogItems = await dbContext.CatalogItems
            .Where(c => catalogItemIds.Contains(c.Id))
            .ToDictionaryAsync(c => c.Id, cancellationToken);

        string? poCurrency = string.IsNullOrWhiteSpace(currency) ? null : currency.Trim();
        foreach (var line in items)
        {
            if (line.Quantity <= 0)
            {
                throw new ArgumentException("Quantity must be greater than zero for every item.", nameof(items));
            }
            if (line.UnitCost < 0)
            {
                throw new ArgumentException("Unit cost cannot be negative.", nameof(items));
            }

            if (line.CatalogItemId is Guid existingId)
            {
                if (!catalogItems.TryGetValue(existingId, out var catalogItem))
                {
                    throw new ArgumentException($"Catalog item {existingId} not found.", nameof(items));
                }

                poCurrency ??= catalogItem.Currency;
                if (catalogItem.Currency != poCurrency)
                {
                    throw new ArgumentException("All items in one purchase order must share the same currency.", nameof(items));
                }
            }
            else
            {
                if (string.IsNullOrWhiteSpace(line.NewItemName))
                {
                    throw new ArgumentException("newItemName is required for a line that isn't restocking an existing catalog item.", nameof(items));
                }
                if (line.NewItemType is null)
                {
                    throw new ArgumentException($"newItemType is required for new item '{line.NewItemName}'.", nameof(items));
                }
            }
        }

        if (poCurrency is null)
        {
            throw new ArgumentException("currency is required when every line is a new catalog item.", nameof(currency));
        }

        var purchaseOrder = new PurchaseOrder
        {
            Id = Guid.NewGuid(),
            BusinessId = tenantProvider.CurrentBusinessId,
            SupplierId = supplierId,
            Status = PurchaseOrderStatus.Ordered,
            Currency = poCurrency,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        dbContext.PurchaseOrders.Add(purchaseOrder);

        decimal total = 0m;
        foreach (var line in items)
        {
            var subtotal = line.UnitCost * line.Quantity;
            total += subtotal;

            dbContext.PurchaseOrderItems.Add(new PurchaseOrderItem
            {
                Id = Guid.NewGuid(),
                BusinessId = tenantProvider.CurrentBusinessId,
                PurchaseOrderId = purchaseOrder.Id,
                CatalogItemId = line.CatalogItemId,
                NewItemName = line.CatalogItemId is null ? line.NewItemName!.Trim() : null,
                NewItemType = line.CatalogItemId is null ? line.NewItemType : null,
                NewItemUnit = line.CatalogItemId is null ? line.NewItemUnit : null,
                Quantity = line.Quantity,
                UnitCost = line.UnitCost,
                Subtotal = subtotal
            });
        }
        purchaseOrder.TotalAmount = total;

        dbContext.AuditLogs.Add(new AuditLog
        {
            Id = Guid.NewGuid(),
            BusinessId = tenantProvider.CurrentBusinessId,
            ActorType = AuditActorType.User,
            ActorId = "pos",
            Action = "purchase_order.created",
            EntityType = nameof(PurchaseOrder),
            EntityId = purchaseOrder.Id.ToString(),
            BeforeStateJson = "{}",
            AfterStateJson = JsonSerializer.Serialize(new { Status = purchaseOrder.Status.ToString(), purchaseOrder.TotalAmount, purchaseOrder.Currency }),
            CreatedAt = DateTimeOffset.UtcNow
        });

        await dbContext.SaveChangesAsync(cancellationToken);

        return await GetPurchaseOrderAsync(businessId, purchaseOrder.Id, cancellationToken);
    }

    public async Task<PurchaseOrderDetail> ReceivePurchaseOrderAsync(
        Guid businessId, Guid purchaseOrderId, IReadOnlyList<ReceivedLinePrice>? linePrices, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        var purchaseOrder = await dbContext.PurchaseOrders.FirstOrDefaultAsync(p => p.Id == purchaseOrderId, cancellationToken)
            ?? throw new ArgumentException($"Purchase order {purchaseOrderId} not found.", nameof(purchaseOrderId));

        if (purchaseOrder.Status != PurchaseOrderStatus.Ordered)
        {
            throw new ArgumentException($"Only an Ordered purchase order can be received (current status: {purchaseOrder.Status}).", nameof(purchaseOrderId));
        }

        var pricesByItemId = (linePrices ?? []).ToDictionary(p => p.PurchaseOrderItemId, p => p.SalePrice);

        // All-or-nothing receiving (v1): every line's stock is bumped together in one step, no
        // partial/line-by-line receiving.
        var items = await dbContext.PurchaseOrderItems.Where(i => i.PurchaseOrderId == purchaseOrder.Id).ToListAsync(cancellationToken);
        var existingCatalogItemIds = items.Where(i => i.CatalogItemId is not null).Select(i => i.CatalogItemId!.Value).Distinct().ToList();
        var catalogItems = await dbContext.CatalogItems
            .Where(c => existingCatalogItemIds.Contains(c.Id))
            .ToDictionaryAsync(c => c.Id, cancellationToken);

        foreach (var line in items)
        {
            pricesByItemId.TryGetValue(line.Id, out var salePrice);

            if (line.CatalogItemId is Guid existingId && catalogItems.TryGetValue(existingId, out var catalogItem))
            {
                if (catalogItem.ItemType == CatalogItemType.Stock)
                {
                    catalogItem.StockQuantity = (catalogItem.StockQuantity ?? 0) + line.Quantity;
                }

                if (salePrice is decimal newPrice)
                {
                    if (newPrice <= 0)
                    {
                        throw new ArgumentException($"Sale price for '{catalogItem.Name}' must be greater than zero.", nameof(linePrices));
                    }

                    var oldPrice = catalogItem.Price;
                    catalogItem.Price = newPrice;

                    dbContext.AuditLogs.Add(new AuditLog
                    {
                        Id = Guid.NewGuid(),
                        BusinessId = tenantProvider.CurrentBusinessId,
                        ActorType = AuditActorType.User,
                        ActorId = "pos",
                        Action = "catalog_item.price_updated",
                        EntityType = nameof(CatalogItem),
                        EntityId = catalogItem.Id.ToString(),
                        BeforeStateJson = JsonSerializer.Serialize(new { Price = oldPrice }),
                        AfterStateJson = JsonSerializer.Serialize(new { Price = newPrice }),
                        CreatedAt = DateTimeOffset.UtcNow
                    });
                }

                catalogItem.UpdatedAt = DateTimeOffset.UtcNow;
            }
            else if (line.CatalogItemId is null)
            {
                if (salePrice is not decimal newItemPrice || newItemPrice <= 0)
                {
                    throw new ArgumentException($"A sale price is required to receive new item '{line.NewItemName}'.", nameof(linePrices));
                }

                var newCatalogItem = await catalogTools.CreateCatalogItemAsync(
                    businessId, line.NewItemName!, line.NewItemType!.Value, newItemPrice, purchaseOrder.Currency,
                    stockQuantity: line.NewItemType == CatalogItemType.Stock ? line.Quantity : null,
                    unit: line.NewItemUnit, code: null, cancellationToken);

                line.CatalogItemId = newCatalogItem.Id;
            }
        }

        purchaseOrder.Status = PurchaseOrderStatus.Received;
        purchaseOrder.ReceivedAt = DateTimeOffset.UtcNow;
        purchaseOrder.UpdatedAt = DateTimeOffset.UtcNow;

        dbContext.AuditLogs.Add(new AuditLog
        {
            Id = Guid.NewGuid(),
            BusinessId = tenantProvider.CurrentBusinessId,
            ActorType = AuditActorType.User,
            ActorId = "pos",
            Action = "purchase_order.received",
            EntityType = nameof(PurchaseOrder),
            EntityId = purchaseOrder.Id.ToString(),
            BeforeStateJson = "{}",
            AfterStateJson = JsonSerializer.Serialize(new { Status = purchaseOrder.Status.ToString() }),
            CreatedAt = DateTimeOffset.UtcNow
        });

        await dbContext.SaveChangesAsync(cancellationToken);

        return await GetPurchaseOrderAsync(businessId, purchaseOrder.Id, cancellationToken);
    }
}
