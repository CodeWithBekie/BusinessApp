using System.Text.Json;
using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Tools;
using AiBusinessPlatform.Domain;
using AiBusinessPlatform.Domain.Entities;
using AiBusinessPlatform.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace AiBusinessPlatform.Infrastructure.Tools;

public class OrderTools(
    AiBusinessPlatformDbContext dbContext,
    ICurrentTenantProvider tenantProvider,
    ICatalogTools catalogTools,
    IApprovalTools approvalTools,
    IPaymentTools paymentTools,
    IWhatsAppMessageService whatsAppMessageService) : IOrderTools
{
    public async Task<InvoiceResult> CreateInvoiceAsync(Guid businessId, Guid customerId, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        var order = await dbContext.Orders.FirstOrDefaultAsync(o => o.CustomerId == customerId && o.Status == OrderStatus.Quoted, cancellationToken)
            ?? throw new InvalidOperationException("No open (Quoted) order to invoice — nothing has been reserved yet.");

        var items = await dbContext.OrderItems.Where(oi => oi.OrderId == order.Id).ToListAsync(cancellationToken);
        if (items.Count == 0)
        {
            throw new InvalidOperationException("Order has no reserved items.");
        }

        var customer = await dbContext.Customers.FirstOrDefaultAsync(c => c.Id == customerId, cancellationToken)
            ?? throw new InvalidOperationException($"Customer {customerId} not found.");

        order.VatAmount = items.Sum(i => i.VatAmount);
        order.TotalAmount = items.Sum(i => i.Subtotal) + order.VatAmount;
        order.Status = OrderStatus.Invoiced;
        order.InvoiceNumber = (await dbContext.Orders
            .Where(o => o.BusinessId == businessId && o.InvoiceNumber != null)
            .MaxAsync(o => (int?)o.InvoiceNumber, cancellationToken) ?? 0) + 1;
        order.UpdatedAt = DateTimeOffset.UtcNow;

        // Attempts a real Paynow Express Checkout transaction if the business has connected
        // Paynow; falls back to a manual/offline reference otherwise (Section 13.2).
        var paymentRequest = await paymentTools.CreatePaymentRequestAsync(
            businessId, order.Id, order.TotalAmount, order.Currency, customer.WhatsAppNumber, cancellationToken);

        var payment = new Payment
        {
            Id = Guid.NewGuid(),
            BusinessId = tenantProvider.CurrentBusinessId,
            OrderId = order.Id,
            Provider = paymentRequest.PollUrl is not null ? PaymentProvider.EcoCash : PaymentProvider.Other,
            ProviderReference = paymentRequest.PaymentReference,
            PollUrl = paymentRequest.PollUrl,
            Amount = order.TotalAmount,
            Status = PaymentStatus.Pending,
            CreatedAt = DateTimeOffset.UtcNow
        };
        dbContext.Payments.Add(payment);

        await dbContext.SaveChangesAsync(cancellationToken);

        var catalogItemIds = items.Select(i => i.CatalogItemId).ToList();
        var catalogInfo = await dbContext.CatalogItems
            .Where(c => catalogItemIds.Contains(c.Id))
            .ToDictionaryAsync(c => c.Id, c => new { c.Name, c.Code }, cancellationToken);

        var lineItems = items
            .Select(i =>
            {
                var info = catalogInfo.GetValueOrDefault(i.CatalogItemId);
                return new InvoiceLineItem(i.CatalogItemId, info?.Name ?? "Unknown item", ResolveItemCode(info?.Code, i.CatalogItemId), i.Quantity, i.UnitPrice, i.Subtotal, i.VatAmount);
            })
            .ToList();

        return new InvoiceResult(order.Id, order.TotalAmount, order.VatAmount, order.Currency, paymentRequest.PaymentReference, paymentRequest.Instructions, lineItems);
    }

    public async Task<PaymentConfirmationResult> ConfirmPaymentAsync(Guid businessId, Guid orderId, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        var order = await dbContext.Orders.FirstOrDefaultAsync(o => o.Id == orderId, cancellationToken)
            ?? throw new InvalidOperationException($"Order {orderId} not found.");
        var payment = await dbContext.Payments.FirstOrDefaultAsync(p => p.OrderId == orderId, cancellationToken)
            ?? throw new InvalidOperationException($"Order {orderId} has no payment record.");

        // Idempotent — a re-delivered/duplicate webhook must not double-process (Section 9.3).
        if (payment.Status == PaymentStatus.Confirmed)
        {
            return new PaymentConfirmationResult(order.Id, payment.Id, order.Status, payment.Status);
        }

        if (order.Status != OrderStatus.Invoiced)
        {
            throw new InvalidOperationException($"Order {orderId} is not Invoiced (current status: {order.Status}).");
        }

        var orderItems = await dbContext.OrderItems.Where(oi => oi.OrderId == order.Id).ToListAsync(cancellationToken);
        foreach (var item in orderItems)
        {
            // Validation checkpoint only — stock was already decremented at reserve time.
            await catalogTools.FinalizeStockAsync(businessId, item.Id, cancellationToken);
        }

        var previousOrderStatus = order.Status;
        payment.Status = PaymentStatus.Confirmed;
        payment.ConfirmedAt = DateTimeOffset.UtcNow;
        order.Status = OrderStatus.Paid;
        order.UpdatedAt = DateTimeOffset.UtcNow;

        dbContext.AuditLogs.Add(new AuditLog
        {
            Id = Guid.NewGuid(),
            BusinessId = tenantProvider.CurrentBusinessId,
            ActorType = AuditActorType.System,
            ActorId = "PaymentWebhookConsumer",
            Action = "payment.confirmed",
            EntityType = nameof(Order),
            EntityId = order.Id.ToString(),
            BeforeStateJson = JsonSerializer.Serialize(new { Status = previousOrderStatus.ToString() }),
            AfterStateJson = JsonSerializer.Serialize(new { Status = order.Status.ToString() }),
            CreatedAt = DateTimeOffset.UtcNow
        });

        // Deterministic, templated receipt — never model-generated, since a financial
        // confirmation shouldn't be phrased by a non-deterministic LLM.
        await SendCustomerMessageAsync(order.CustomerId, $"Receipt: Order {order.Id} paid — {order.TotalAmount} {order.Currency}. Thank you!", cancellationToken);

        await dbContext.SaveChangesAsync(cancellationToken);

        return new PaymentConfirmationResult(order.Id, payment.Id, order.Status, payment.Status);
    }

    public async Task<OrderDetailSummary> RecordManualPaymentAsync(
        Guid businessId, Guid orderId, PaymentProvider provider, string reference, decimal amount, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }
        if (string.IsNullOrWhiteSpace(reference))
        {
            throw new ArgumentException("reference is required.", nameof(reference));
        }
        if (amount <= 0)
        {
            throw new ArgumentException("amount must be greater than zero.", nameof(amount));
        }

        var order = await dbContext.Orders.FirstOrDefaultAsync(o => o.Id == orderId, cancellationToken)
            ?? throw new InvalidOperationException($"Order {orderId} not found.");

        if (order.Status is OrderStatus.Fulfilled or OrderStatus.Cancelled)
        {
            throw new InvalidOperationException($"Order {orderId} is {order.Status} — payment can no longer be recorded.");
        }
        if (order.Status == OrderStatus.Paid)
        {
            throw new InvalidOperationException($"Order {orderId} already has a confirmed payment.");
        }

        var trimmedReference = reference.Trim();
        var referenceInUse = await dbContext.Payments.AnyAsync(p => p.ProviderReference == trimmedReference && p.OrderId != orderId, cancellationToken);
        if (referenceInUse)
        {
            throw new ArgumentException($"Payment reference '{trimmedReference}' is already in use.", nameof(reference));
        }

        // A Quoted order was never invoiced, so it has no Payment row yet; an Invoiced order
        // already has a Pending stub payment from CreateInvoiceAsync — finalize that one in place.
        var payment = await dbContext.Payments.FirstOrDefaultAsync(p => p.OrderId == order.Id, cancellationToken);
        if (payment is null)
        {
            payment = new Payment
            {
                Id = Guid.NewGuid(),
                BusinessId = tenantProvider.CurrentBusinessId,
                OrderId = order.Id,
                CreatedAt = DateTimeOffset.UtcNow
            };
            dbContext.Payments.Add(payment);
        }
        payment.Provider = provider;
        payment.ProviderReference = trimmedReference;
        payment.Amount = amount;
        payment.Status = PaymentStatus.Confirmed;
        payment.ConfirmedAt = DateTimeOffset.UtcNow;

        var orderItems = await dbContext.OrderItems.Where(oi => oi.OrderId == order.Id).ToListAsync(cancellationToken);
        foreach (var item in orderItems)
        {
            // Validation checkpoint only — stock was already decremented at reserve time.
            await catalogTools.FinalizeStockAsync(businessId, item.Id, cancellationToken);
        }

        var previousStatus = order.Status;
        order.Status = OrderStatus.Paid;
        order.UpdatedAt = DateTimeOffset.UtcNow;

        dbContext.AuditLogs.Add(new AuditLog
        {
            Id = Guid.NewGuid(),
            BusinessId = tenantProvider.CurrentBusinessId,
            ActorType = AuditActorType.User,
            ActorId = "dashboard",
            Action = "payment.recorded_manually",
            EntityType = nameof(Order),
            EntityId = order.Id.ToString(),
            BeforeStateJson = JsonSerializer.Serialize(new { Status = previousStatus.ToString() }),
            AfterStateJson = JsonSerializer.Serialize(new { Status = order.Status.ToString(), Provider = provider.ToString(), Reference = trimmedReference, Amount = amount }),
            CreatedAt = DateTimeOffset.UtcNow
        });

        await SendCustomerMessageAsync(order.CustomerId, $"Receipt: Order {order.Id} paid — {order.TotalAmount} {order.Currency}. Thank you!", cancellationToken);

        await dbContext.SaveChangesAsync(cancellationToken);

        return await GetOrderAsync(businessId, order.Id, cancellationToken);
    }

    public async Task<OrderDetailSummary> UpdatePaymentProviderAsync(
        Guid businessId, Guid orderId, PaymentProvider provider, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        var order = await dbContext.Orders.FirstOrDefaultAsync(o => o.Id == orderId, cancellationToken)
            ?? throw new InvalidOperationException($"Order {orderId} not found.");

        if (order.Status is OrderStatus.Fulfilled or OrderStatus.Cancelled)
        {
            throw new InvalidOperationException($"Order {orderId} is {order.Status} — payment can no longer be edited.");
        }

        var payment = await dbContext.Payments.FirstOrDefaultAsync(p => p.OrderId == order.Id && p.Status == PaymentStatus.Confirmed, cancellationToken)
            ?? throw new InvalidOperationException($"Order {orderId} has no confirmed payment to edit.");

        var previousProvider = payment.Provider;
        payment.Provider = provider;

        dbContext.AuditLogs.Add(new AuditLog
        {
            Id = Guid.NewGuid(),
            BusinessId = tenantProvider.CurrentBusinessId,
            ActorType = AuditActorType.User,
            ActorId = "dashboard",
            Action = "payment.provider_updated",
            EntityType = nameof(Payment),
            EntityId = payment.Id.ToString(),
            BeforeStateJson = JsonSerializer.Serialize(new { Provider = previousProvider.ToString() }),
            AfterStateJson = JsonSerializer.Serialize(new { Provider = provider.ToString() }),
            CreatedAt = DateTimeOffset.UtcNow
        });

        await dbContext.SaveChangesAsync(cancellationToken);

        return await GetOrderAsync(businessId, order.Id, cancellationToken);
    }

    public async Task<OrderCancellationRequestResult> RequestOrderCancellationApprovalAsync(Guid businessId, Guid customerId, string reason, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        // Phase 0 simplification: picks the customer's most recent Paid order — a customer with
        // more than one Paid order can only request cancellation of the latest this way.
        var order = await dbContext.Orders
            .Where(o => o.CustomerId == customerId && o.Status == OrderStatus.Paid)
            .OrderByDescending(o => o.UpdatedAt)
            .FirstOrDefaultAsync(cancellationToken);

        if (order is null)
        {
            return new OrderCancellationRequestResult(false, null, null, null, null, "No paid order found to cancel.");
        }

        var details = new CancelPaidOrderDetails(order.Id, customerId, order.TotalAmount, order.Currency, reason, DateTimeOffset.UtcNow);
        var approval = await approvalTools.RequestApprovalAsync(businessId, ApprovalActionTypes.CancelPaidOrder, JsonSerializer.Serialize(details), cancellationToken);

        return new OrderCancellationRequestResult(true, approval.PendingApprovalId, order.Id, order.TotalAmount, order.Currency, null);
    }

    public async Task<OrderCancellationResult> CancelPaidOrderAsync(Guid businessId, Guid orderId, Guid? decidedBy, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        var order = await dbContext.Orders.FirstOrDefaultAsync(o => o.Id == orderId, cancellationToken)
            ?? throw new InvalidOperationException($"Order {orderId} not found.");

        // Idempotent — a retried decision-endpoint call must not re-cancel/re-notify.
        if (order.Status == OrderStatus.Cancelled)
        {
            return new OrderCancellationResult(order.Id, order.Status);
        }

        if (order.Status != OrderStatus.Paid)
        {
            throw new InvalidOperationException($"Order {orderId} is not Paid (current status: {order.Status}) — cannot approve a cancellation for it.");
        }

        var orderItems = await dbContext.OrderItems.Where(oi => oi.OrderId == order.Id).ToListAsync(cancellationToken);
        var catalogItemIds = orderItems.Select(oi => oi.CatalogItemId).ToList();
        var catalogItems = await dbContext.CatalogItems
            .Where(c => catalogItemIds.Contains(c.Id))
            .ToDictionaryAsync(c => c.Id, cancellationToken);

        foreach (var item in orderItems)
        {
            if (catalogItems.TryGetValue(item.CatalogItemId, out var catalogItem) && catalogItem.StockQuantity is not null)
            {
                catalogItem.StockQuantity += item.Quantity;
                catalogItem.UpdatedAt = DateTimeOffset.UtcNow;
            }
        }

        var previousStatus = order.Status;
        order.Status = OrderStatus.Cancelled;
        order.UpdatedAt = DateTimeOffset.UtcNow;

        dbContext.AuditLogs.Add(new AuditLog
        {
            Id = Guid.NewGuid(),
            BusinessId = tenantProvider.CurrentBusinessId,
            ActorType = AuditActorType.User,
            ActorId = decidedBy?.ToString() ?? "unknown-dev-decision",
            Action = "order.cancellation.approved",
            EntityType = nameof(Order),
            EntityId = order.Id.ToString(),
            BeforeStateJson = JsonSerializer.Serialize(new { Status = previousStatus.ToString() }),
            AfterStateJson = JsonSerializer.Serialize(new { Status = order.Status.ToString() }),
            CreatedAt = DateTimeOffset.UtcNow
        });

        await SendCustomerMessageAsync(order.CustomerId, $"Your order {order.Id} has been cancelled per your request and a refund will be arranged. We're sorry for the inconvenience.", cancellationToken);

        await dbContext.SaveChangesAsync(cancellationToken);
        return new OrderCancellationResult(order.Id, order.Status);
    }

    public async Task NotifyOrderCancellationRejectedAsync(Guid businessId, Guid orderId, Guid? decidedBy, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        var order = await dbContext.Orders.FirstOrDefaultAsync(o => o.Id == orderId, cancellationToken)
            ?? throw new InvalidOperationException($"Order {orderId} not found.");

        dbContext.AuditLogs.Add(new AuditLog
        {
            Id = Guid.NewGuid(),
            BusinessId = tenantProvider.CurrentBusinessId,
            ActorType = AuditActorType.User,
            ActorId = decidedBy?.ToString() ?? "unknown-dev-decision",
            Action = "order.cancellation.rejected",
            EntityType = nameof(Order),
            EntityId = order.Id.ToString(),
            BeforeStateJson = JsonSerializer.Serialize(new { Status = order.Status.ToString() }),
            AfterStateJson = JsonSerializer.Serialize(new { Status = order.Status.ToString() }),
            CreatedAt = DateTimeOffset.UtcNow
        });

        await SendCustomerMessageAsync(order.CustomerId, $"We're sorry, your request to cancel/refund order {order.Id} was not approved. Please contact us if you have questions.", cancellationToken);

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task<OrderFulfillmentResult> MarkOrderFulfilledAsync(Guid businessId, Guid orderId, Guid? decidedBy, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        var order = await dbContext.Orders.FirstOrDefaultAsync(o => o.Id == orderId, cancellationToken)
            ?? throw new InvalidOperationException($"Order {orderId} not found.");

        // Idempotent — a retried dashboard call must not re-fulfill/re-notify.
        if (order.Status == OrderStatus.Fulfilled)
        {
            return new OrderFulfillmentResult(order.Id, order.Status);
        }

        if (order.Status != OrderStatus.Paid)
        {
            throw new InvalidOperationException($"Order {orderId} is not Paid (current status: {order.Status}) — cannot mark it fulfilled.");
        }

        var previousStatus = order.Status;
        order.Status = OrderStatus.Fulfilled;
        order.UpdatedAt = DateTimeOffset.UtcNow;

        dbContext.AuditLogs.Add(new AuditLog
        {
            Id = Guid.NewGuid(),
            BusinessId = tenantProvider.CurrentBusinessId,
            ActorType = AuditActorType.User,
            ActorId = decidedBy?.ToString() ?? "unknown-dev-decision",
            Action = "order.fulfilled",
            EntityType = nameof(Order),
            EntityId = order.Id.ToString(),
            BeforeStateJson = JsonSerializer.Serialize(new { Status = previousStatus.ToString() }),
            AfterStateJson = JsonSerializer.Serialize(new { Status = order.Status.ToString() }),
            CreatedAt = DateTimeOffset.UtcNow
        });

        await SendCustomerMessageAsync(order.CustomerId, $"Your order {order.Id} has been fulfilled — thank you for your business!", cancellationToken);

        await dbContext.SaveChangesAsync(cancellationToken);
        return new OrderFulfillmentResult(order.Id, order.Status);
    }

    public async Task<IReadOnlyList<OrderSummary>> ListOrdersAsync(Guid businessId, OrderStatus? status, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        var query =
            from o in dbContext.Orders.AsNoTracking()
            join c in dbContext.Customers.AsNoTracking() on o.CustomerId equals c.Id
            select new { o, c };

        if (status is not null)
        {
            query = query.Where(x => x.o.Status == status);
        }

        return await query
            .OrderByDescending(x => x.o.CreatedAt)
            .Select(x => new OrderSummary(
                x.o.Id, x.c.Id, x.c.WhatsAppNumber, x.c.Name, x.o.Status, x.o.TotalAmount, x.o.Currency,
                dbContext.OrderItems.Count(oi => oi.OrderId == x.o.Id), x.o.CreatedAt, x.o.UpdatedAt))
            .ToListAsync(cancellationToken);
    }

    public async Task<OrderDetailSummary> GetOrderAsync(Guid businessId, Guid orderId, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }

        var order = await dbContext.Orders.AsNoTracking().FirstOrDefaultAsync(o => o.Id == orderId, cancellationToken)
            ?? throw new KeyNotFoundException($"Order {orderId} not found.");

        var customer = await dbContext.Customers.AsNoTracking().FirstOrDefaultAsync(c => c.Id == order.CustomerId, cancellationToken);

        var rawItems = await (
            from oi in dbContext.OrderItems.AsNoTracking()
            join ci in dbContext.CatalogItems.AsNoTracking() on oi.CatalogItemId equals ci.Id into ciJoin
            from ci in ciJoin.DefaultIfEmpty()
            where oi.OrderId == order.Id
            select new { oi.CatalogItemId, Name = ci != null ? ci.Name : "Unknown item", Code = ci != null ? ci.Code : null, oi.Quantity, oi.UnitPrice, oi.Subtotal, oi.VatAmount }
        ).ToListAsync(cancellationToken);

        var items = rawItems
            .Select(i => new InvoiceLineItem(i.CatalogItemId, i.Name, ResolveItemCode(i.Code, i.CatalogItemId), i.Quantity, i.UnitPrice, i.Subtotal, i.VatAmount))
            .ToList();

        var payment = await dbContext.Payments.AsNoTracking().FirstOrDefaultAsync(p => p.OrderId == order.Id, cancellationToken);

        return new OrderDetailSummary(
            order.Id, order.CustomerId, customer?.WhatsAppNumber ?? "", customer?.Name,
            order.Status, order.TotalAmount, order.VatAmount, order.InvoiceNumber, order.Currency, items,
            payment is null ? null : new OrderPaymentSummary(payment.Provider, payment.ProviderReference, payment.Status, payment.Amount, payment.ConfirmedAt, payment.AmountTendered, payment.AmountTendered - payment.Amount),
            order.CreatedAt, order.UpdatedAt);
    }

    // New ground, not a spec section — a walk-in/in-person sale (no WhatsApp conversation ever
    // happens). Finalizes as Paid in one step: the money has already changed hands (cash) or
    // already cleared (card/mobile money tap), so there's no Quoted/Invoiced intermediate stage
    // and no separate reserve/finalize two-step for stock (decremented once, here, permanently).
    public async Task<PosSaleResult> RecordPosSaleAsync(
        Guid businessId, IReadOnlyList<PosSaleLineItem> items, string paymentMethod, Guid? customerId, string? customerWhatsAppNumber, string? customerName,
        decimal? amountTendered = null, CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }
        if (items.Count == 0)
        {
            throw new ArgumentException("At least one item is required.", nameof(items));
        }
        if (!Enum.TryParse<PaymentProvider>(paymentMethod, true, out var provider))
        {
            throw new ArgumentException("paymentMethod must be \"Cash\", \"EcoCash\", \"Bank\", or \"Other\".", nameof(paymentMethod));
        }
        if (customerId is null && string.IsNullOrWhiteSpace(customerWhatsAppNumber) && !string.IsNullOrWhiteSpace(customerName))
        {
            throw new ArgumentException("A phone number is required to save a customer name.", nameof(customerName));
        }
        if (amountTendered is not null && provider != PaymentProvider.Cash)
        {
            throw new ArgumentException("amountTendered only applies to Cash sales.", nameof(amountTendered));
        }

        var catalogItemIds = items.Select(i => i.CatalogItemId).Distinct().ToList();
        var catalogItems = await dbContext.CatalogItems
            .Where(c => catalogItemIds.Contains(c.Id))
            .ToDictionaryAsync(c => c.Id, cancellationToken);

        string? saleCurrency = null;
        foreach (var line in items)
        {
            if (line.Quantity <= 0)
            {
                throw new ArgumentException("Quantity must be greater than zero for every item.", nameof(items));
            }
            if (!catalogItems.TryGetValue(line.CatalogItemId, out var catalogItem) || !catalogItem.Active)
            {
                throw new ArgumentException($"Catalog item {line.CatalogItemId} not found or inactive.", nameof(items));
            }
            if (catalogItem.ItemType == CatalogItemType.Stock && catalogItem.StockQuantity is not null && catalogItem.StockQuantity < line.Quantity)
            {
                throw new ArgumentException($"Only {catalogItem.StockQuantity} of \"{catalogItem.Name}\" in stock, requested {line.Quantity}.", nameof(items));
            }

            saleCurrency ??= catalogItem.Currency;
            if (catalogItem.Currency != saleCurrency)
            {
                throw new ArgumentException("All items in one sale must share the same currency.", nameof(items));
            }
        }

        Customer customer;
        if (customerId is not null)
        {
            customer = await dbContext.Customers.FirstOrDefaultAsync(c => c.Id == customerId, cancellationToken)
                ?? throw new ArgumentException($"Customer {customerId} not found.", nameof(customerId));
        }
        else if (!string.IsNullOrWhiteSpace(customerWhatsAppNumber))
        {
            customer = await GetOrCreateCustomerByNumberAsync(customerWhatsAppNumber.Trim(), cancellationToken, string.IsNullOrWhiteSpace(customerName) ? null : customerName.Trim());
        }
        else
        {
            customer = await GetOrCreateWalkInCustomerAsync(cancellationToken);
        }

        var order = new Order
        {
            Id = Guid.NewGuid(),
            BusinessId = tenantProvider.CurrentBusinessId,
            CustomerId = customer.Id,
            Status = OrderStatus.Paid,
            Currency = saleCurrency!,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        dbContext.Orders.Add(order);

        var vatRate = await GetVatRateAsync(cancellationToken);

        var lineItems = new List<InvoiceLineItem>();
        decimal total = 0m;
        decimal totalVat = 0m;
        foreach (var line in items)
        {
            var catalogItem = catalogItems[line.CatalogItemId];
            var subtotal = catalogItem.Price * line.Quantity;
            var lineVat = VatCalculator.CalculateVat(subtotal, vatRate);
            total += subtotal;
            totalVat += lineVat;

            dbContext.OrderItems.Add(new OrderItem
            {
                Id = Guid.NewGuid(),
                BusinessId = tenantProvider.CurrentBusinessId,
                OrderId = order.Id,
                CatalogItemId = catalogItem.Id,
                Quantity = line.Quantity,
                UnitPrice = catalogItem.Price,
                Subtotal = subtotal,
                VatAmount = lineVat
            });

            if (catalogItem.ItemType == CatalogItemType.Stock && catalogItem.StockQuantity is not null)
            {
                catalogItem.StockQuantity -= line.Quantity;
                catalogItem.UpdatedAt = DateTimeOffset.UtcNow;
            }

            lineItems.Add(new InvoiceLineItem(catalogItem.Id, catalogItem.Name, ResolveItemCode(catalogItem.Code, catalogItem.Id), line.Quantity, catalogItem.Price, subtotal, lineVat));
        }
        var grandTotal = total + totalVat;
        order.TotalAmount = grandTotal;
        order.VatAmount = totalVat;

        if (amountTendered is not null && amountTendered < grandTotal)
        {
            throw new ArgumentException($"Amount tendered ({amountTendered}) is less than the total ({grandTotal}).", nameof(amountTendered));
        }

        // Short and spoken-aloud-friendly (e.g. "P-O-S dash K7 M2") rather than a 32-char GUID, since
        // this is what a cashier reads out to a customer at the till. ProviderReference has a
        // table-wide unique index (PaymentConfiguration.cs), so collisions are handled by
        // regenerating and retrying below rather than assumed away.
        var providerReference = GenerateShortReference();
        var payment = new Payment
        {
            Id = Guid.NewGuid(),
            BusinessId = tenantProvider.CurrentBusinessId,
            OrderId = order.Id,
            Provider = provider,
            ProviderReference = providerReference,
            Amount = grandTotal,
            AmountTendered = amountTendered,
            Status = PaymentStatus.Confirmed,
            CreatedAt = DateTimeOffset.UtcNow,
            ConfirmedAt = DateTimeOffset.UtcNow
        };
        dbContext.Payments.Add(payment);

        dbContext.AuditLogs.Add(new AuditLog
        {
            Id = Guid.NewGuid(),
            BusinessId = tenantProvider.CurrentBusinessId,
            ActorType = AuditActorType.User,
            ActorId = "pos",
            Action = "order.pos_sale_recorded",
            EntityType = nameof(Order),
            EntityId = order.Id.ToString(),
            BeforeStateJson = "{}",
            AfterStateJson = JsonSerializer.Serialize(new { Status = order.Status.ToString(), order.TotalAmount, order.Currency }),
            CreatedAt = DateTimeOffset.UtcNow
        });

        const int maxReferenceAttempts = 5;
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                await dbContext.SaveChangesAsync(cancellationToken);
                break;
            }
            catch (DbUpdateException ex) when (attempt < maxReferenceAttempts && IsProviderReferenceCollision(ex))
            {
                providerReference = GenerateShortReference();
                payment.ProviderReference = providerReference;
            }
        }

        return new PosSaleResult(
            order.Id, grandTotal, totalVat, saleCurrency!, providerReference, lineItems, customer.Id, customer.WhatsAppNumber, customer.Name,
            amountTendered, amountTendered - grandTotal);
    }

    // The "not paid yet" counterpart to RecordPosSaleAsync above — reuses
    // ICatalogTools.ReserveStockAsync per line (already does "reserve stock + create/merge into a
    // Quoted order", the exact same reservation model the WhatsApp orchestrator uses one item at a
    // time) instead of duplicating that logic here.
    public async Task<QuotationResult> CreateQuotationAsync(
        Guid businessId, IReadOnlyList<PosSaleLineItem> items, Guid? customerId, string? customerWhatsAppNumber, string? customerName,
        CancellationToken cancellationToken = default)
    {
        if (businessId != tenantProvider.CurrentBusinessId)
        {
            throw new InvalidOperationException("businessId does not match the current tenant context.");
        }
        if (items.Count == 0)
        {
            throw new ArgumentException("At least one item is required.", nameof(items));
        }
        if (customerId is null && string.IsNullOrWhiteSpace(customerWhatsAppNumber) && !string.IsNullOrWhiteSpace(customerName))
        {
            throw new ArgumentException("A phone number is required to save a customer name.", nameof(customerName));
        }

        var catalogItemIds = items.Select(i => i.CatalogItemId).Distinct().ToList();
        var catalogItems = await dbContext.CatalogItems
            .Where(c => catalogItemIds.Contains(c.Id))
            .ToDictionaryAsync(c => c.Id, cancellationToken);

        string? quoteCurrency = null;
        foreach (var line in items)
        {
            if (line.Quantity <= 0)
            {
                throw new ArgumentException("Quantity must be greater than zero for every item.", nameof(items));
            }
            if (!catalogItems.TryGetValue(line.CatalogItemId, out var catalogItem) || !catalogItem.Active)
            {
                throw new ArgumentException($"Catalog item {line.CatalogItemId} not found or inactive.", nameof(items));
            }

            quoteCurrency ??= catalogItem.Currency;
            if (catalogItem.Currency != quoteCurrency)
            {
                throw new ArgumentException("All items in one quotation must share the same currency.", nameof(items));
            }
        }

        Customer customer;
        if (customerId is not null)
        {
            customer = await dbContext.Customers.FirstOrDefaultAsync(c => c.Id == customerId, cancellationToken)
                ?? throw new ArgumentException($"Customer {customerId} not found.", nameof(customerId));
        }
        else if (!string.IsNullOrWhiteSpace(customerWhatsAppNumber))
        {
            customer = await GetOrCreateCustomerByNumberAsync(customerWhatsAppNumber.Trim(), cancellationToken, string.IsNullOrWhiteSpace(customerName) ? null : customerName.Trim());
        }
        else
        {
            customer = await GetOrCreateWalkInCustomerAsync(cancellationToken);
        }

        foreach (var line in items)
        {
            var reservation = await catalogTools.ReserveStockAsync(businessId, customer.Id, line.CatalogItemId, line.Quantity, cancellationToken);
            if (!reservation.Success)
            {
                throw new ArgumentException(reservation.Reason ?? "Unable to reserve stock.", nameof(items));
            }
        }

        var order = await dbContext.Orders.FirstAsync(o => o.CustomerId == customer.Id && o.Status == OrderStatus.Quoted, cancellationToken);

        var rawLineItems = await (
            from oi in dbContext.OrderItems.AsNoTracking()
            join ci in dbContext.CatalogItems.AsNoTracking() on oi.CatalogItemId equals ci.Id into ciJoin
            from ci in ciJoin.DefaultIfEmpty()
            where oi.OrderId == order.Id
            select new { oi.CatalogItemId, Name = ci != null ? ci.Name : "Unknown item", Code = ci != null ? ci.Code : null, oi.Quantity, oi.UnitPrice, oi.Subtotal, oi.VatAmount }
        ).ToListAsync(cancellationToken);

        var lineItems = rawLineItems
            .Select(i => new InvoiceLineItem(i.CatalogItemId, i.Name, ResolveItemCode(i.Code, i.CatalogItemId), i.Quantity, i.UnitPrice, i.Subtotal, i.VatAmount))
            .ToList();

        dbContext.AuditLogs.Add(new AuditLog
        {
            Id = Guid.NewGuid(),
            BusinessId = tenantProvider.CurrentBusinessId,
            ActorType = AuditActorType.User,
            ActorId = "pos",
            Action = "order.quotation_created",
            EntityType = nameof(Order),
            EntityId = order.Id.ToString(),
            BeforeStateJson = "{}",
            AfterStateJson = JsonSerializer.Serialize(new { Status = order.Status.ToString(), order.TotalAmount, order.Currency }),
            CreatedAt = DateTimeOffset.UtcNow
        });
        await dbContext.SaveChangesAsync(cancellationToken);

        return new QuotationResult(order.Id, order.TotalAmount, order.VatAmount, order.Currency, lineItems, customer.Id, customer.WhatsAppNumber, customer.Name);
    }

    private Task<decimal> GetVatRateAsync(CancellationToken cancellationToken) =>
        dbContext.Businesses.Where(b => b.Id == tenantProvider.CurrentBusinessId).Select(b => b.VatRate).FirstAsync(cancellationToken);

    // Invoices always need a non-empty Code column — falls back to a short, human-readable slice
    // of the catalog item's own id when the owner hasn't set one.
    private static string ResolveItemCode(string? code, Guid catalogItemId) =>
        string.IsNullOrWhiteSpace(code) ? catalogItemId.ToString()[..8].ToUpperInvariant() : code;

    // Excludes visually-confusable characters (0/O, 1/I) since a cashier or customer reads this
    // back manually. 4 chars from a 32-symbol alphabet is ~1M combinations — collisions are rare
    // but handled explicitly above via ProviderReference's unique index, not assumed away.
    private static string GenerateShortReference()
    {
        const string alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
        Span<char> chars = stackalloc char[4];
        for (var i = 0; i < chars.Length; i++)
        {
            chars[i] = alphabet[Random.Shared.Next(alphabet.Length)];
        }
        return $"POS-{new string(chars)}";
    }

    private static bool IsProviderReferenceCollision(DbUpdateException ex)
        => ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation } pg
           && pg.ConstraintName is not null
           && pg.ConstraintName.Contains("ProviderReference", StringComparison.OrdinalIgnoreCase);

    // One stable sentinel Customer per business for anonymous walk-in sales — reused across sales
    // rather than creating a new row every time, safe under Customer's existing unique index on
    // (BusinessId, WhatsAppNumber).
    private async Task<Customer> GetOrCreateWalkInCustomerAsync(CancellationToken cancellationToken)
        => await GetOrCreateCustomerByNumberAsync("walk-in", cancellationToken, "Walk-in Customer");

    private async Task<Customer> GetOrCreateCustomerByNumberAsync(string whatsAppNumber, CancellationToken cancellationToken, string? name = null)
    {
        var customer = await dbContext.Customers.FirstOrDefaultAsync(c => c.WhatsAppNumber == whatsAppNumber, cancellationToken);
        if (customer is not null)
        {
            // A later sale supplying a name (e.g. the owner finally learns/enters a repeat
            // walk-in's name) fills it in or corrects it, rather than being silently discarded.
            if (!string.IsNullOrWhiteSpace(name) && customer.Name != name)
            {
                customer.Name = name;
            }
            return customer;
        }

        customer = new Customer
        {
            Id = Guid.NewGuid(),
            BusinessId = tenantProvider.CurrentBusinessId,
            WhatsAppNumber = whatsAppNumber,
            Name = name,
            CreatedAt = DateTimeOffset.UtcNow
        };
        dbContext.Customers.Add(customer);
        await dbContext.SaveChangesAsync(cancellationToken);
        return customer;
    }

    // Deterministic/templated by design: financial and status-changing confirmations should never
    // be model-generated. Delegates the actual send + persistence to IWhatsAppMessageService (the
    // one shared place every WhatsApp send goes through) — previously this only wrote a DB row and
    // never called IWhatsAppSender at all, so these messages never actually reached WhatsApp.
    private async Task SendCustomerMessageAsync(Guid customerId, string content, CancellationToken cancellationToken)
    {
        await whatsAppMessageService.SendAsync(tenantProvider.CurrentBusinessId, customerId, content, cancellationToken);
    }
}
