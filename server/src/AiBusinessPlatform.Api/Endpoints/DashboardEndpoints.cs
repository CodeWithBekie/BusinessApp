using System.Text.Json;
using AiBusinessPlatform.Api.Contracts;
using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Tools;
using AiBusinessPlatform.Domain;
using AiBusinessPlatform.Domain.Entities;
using AiBusinessPlatform.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace AiBusinessPlatform.Api.Endpoints;

public static class DashboardEndpoints
{
    public static void MapDashboardEndpoints(this WebApplication app)
    {
        // "BusinessOnly" (not the bare default policy) so a validly-signed customer JWT — which
        // has no business_id claim — gets a clean 403 here instead of passing auth and then
        // throwing an unhandled 500 from ICurrentTenantProvider.CurrentBusinessId deeper in.
        var api = app.MapGroup("/api").RequireAuthorization("BusinessOnly");

        // Business isn't ITenantScoped (it IS the tenant), so this is a plain lookup by the
        // ambient tenant id — no IgnoreQueryFilters() involved or applicable.
        api.MapPatch("/business/visibility", async (
            BusinessVisibilityRequest request, AiBusinessPlatformDbContext db, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
        {
            var business = await db.Businesses.FirstOrDefaultAsync(b => b.Id == tenantProvider.CurrentBusinessId, ct)
                ?? throw new KeyNotFoundException("Business not found.");
            business.IsPubliclyListed = request.IsPubliclyListed;
            await db.SaveChangesAsync(ct);
            return Results.Ok(new BusinessVisibilityRequest(business.IsPubliclyListed));
        }).RequireAuthorization("Permission:ManageBusinessSettings");

        // Fiscal-invoice/VAT settings — the owner fills these in themselves (Section: ZIMRA-style
        // invoice redesign). VatRate defaults to 0 on every business and only changes what's
        // charged once the owner explicitly sets it here.
        api.MapGet("/business", async (AiBusinessPlatformDbContext db, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
        {
            var business = await db.Businesses.AsNoTracking().FirstOrDefaultAsync(b => b.Id == tenantProvider.CurrentBusinessId, ct)
                ?? throw new KeyNotFoundException("Business not found.");
            return Results.Ok(new BusinessDetailsResponse(
                business.Name, business.Tin, business.VatNumber, business.Address, business.Email, business.Phone,
                business.VatRate, business.DeviceSerialNumber, business.FiscalDeviceId));
        }).RequireAuthorization("Permission:ManageBusinessSettings");

        api.MapPatch("/business", async (
            UpdateBusinessDetailsRequest request, AiBusinessPlatformDbContext db, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
        {
            if (request.VatRate < 0 || request.VatRate > 1)
            {
                return Results.BadRequest("vatRate must be between 0 and 1 (e.g. 0.15 for 15%).");
            }

            var business = await db.Businesses.FirstOrDefaultAsync(b => b.Id == tenantProvider.CurrentBusinessId, ct)
                ?? throw new KeyNotFoundException("Business not found.");

            business.Tin = string.IsNullOrWhiteSpace(request.Tin) ? null : request.Tin.Trim();
            business.VatNumber = string.IsNullOrWhiteSpace(request.VatNumber) ? null : request.VatNumber.Trim();
            business.Address = string.IsNullOrWhiteSpace(request.Address) ? null : request.Address.Trim();
            business.Email = string.IsNullOrWhiteSpace(request.Email) ? null : request.Email.Trim();
            business.Phone = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim();
            business.VatRate = request.VatRate;
            business.DeviceSerialNumber = string.IsNullOrWhiteSpace(request.DeviceSerialNumber) ? null : request.DeviceSerialNumber.Trim();
            business.FiscalDeviceId = string.IsNullOrWhiteSpace(request.FiscalDeviceId) ? null : request.FiscalDeviceId.Trim();
            await db.SaveChangesAsync(ct);

            return Results.Ok(new BusinessDetailsResponse(
                business.Name, business.Tin, business.VatNumber, business.Address, business.Email, business.Phone,
                business.VatRate, business.DeviceSerialNumber, business.FiscalDeviceId));
        }).RequireAuthorization("Permission:ManageBusinessSettings");

        // FR15 (Section 6.3) — thin mapping over ICatalogTools, the same functions the MCP
        // server's list_catalog_items/create_catalog_item/update_catalog_item tools call
        // (Section 10.2/10.7's "one function, multiple entry points").
        api.MapGet("/catalog", async (bool? lowStockOnly, ICatalogTools catalogTools, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
            Results.Ok(await catalogTools.ListCatalogItemsAsync(tenantProvider.CurrentBusinessId, activeOnly: null, lowStockOnly, ct)));

        api.MapPost("/catalog", async (
            CreateCatalogItemRequest request, ICatalogTools catalogTools, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
        {
            try
            {
                var item = await catalogTools.CreateCatalogItemAsync(
                    tenantProvider.CurrentBusinessId, request.Name, request.ItemType, request.Price,
                    request.Currency, request.StockQuantity, request.Unit, request.Code, request.LowStockThreshold, ct);
                return Results.Created($"/api/catalog/{item.Id}", item);
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        }).RequireAuthorization("Permission:ManageCatalog");

        api.MapPatch("/catalog/{id:guid}", async (
            Guid id, UpdateCatalogItemRequest request, ICatalogTools catalogTools, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
        {
            try
            {
                var item = await catalogTools.UpdateCatalogItemAsync(
                    tenantProvider.CurrentBusinessId, id, request.Name, request.Price,
                    request.Currency, request.StockQuantity, request.Unit, request.Active, request.Code, request.LowStockThreshold, ct);
                return Results.Ok(item);
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(ex.Message);
            }
            catch (KeyNotFoundException)
            {
                return Results.NotFound();
            }
        }).RequireAuthorization("Permission:ManageCatalog");

        var allowedImageContentTypes = new HashSet<string> { "image/jpeg", "image/png", "image/webp" };
        const long maxImageBytes = 5 * 1024 * 1024;

        api.MapPut("/catalog/{id:guid}/image", async (
            Guid id, IFormFile file, ICatalogTools catalogTools, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
        {
            if (file.Length == 0)
            {
                return Results.BadRequest("A file is required.");
            }
            if (file.Length > maxImageBytes)
            {
                return Results.BadRequest("Image must be 5MB or smaller.");
            }
            if (!allowedImageContentTypes.Contains(file.ContentType))
            {
                return Results.BadRequest("Image must be JPEG, PNG, or WebP.");
            }

            using var stream = new MemoryStream();
            await file.CopyToAsync(stream, ct);

            try
            {
                var item = await catalogTools.SetCatalogItemImageAsync(tenantProvider.CurrentBusinessId, id, stream.ToArray(), file.ContentType, ct);
                return Results.Ok(item);
            }
            catch (KeyNotFoundException)
            {
                return Results.NotFound();
            }
        }).RequireAuthorization("Permission:ManageCatalog").DisableAntiforgery();

        api.MapDelete("/catalog/{id:guid}/image", async (
            Guid id, ICatalogTools catalogTools, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
        {
            try
            {
                var item = await catalogTools.RemoveCatalogItemImageAsync(tenantProvider.CurrentBusinessId, id, ct);
                return Results.Ok(item);
            }
            catch (KeyNotFoundException)
            {
                return Results.NotFound();
            }
        }).RequireAuthorization("Permission:ManageCatalog");

        // Anonymous and outside the tenant-filtered ICatalogTools path on purpose — an <Image> tag
        // (native or web) can't attach an Authorization header, so this is served like a public
        // asset URL, trusted only by the item's unguessable GUID (mirrors how most e-commerce apps
        // serve product photos). IgnoreQueryFilters() is required here since there's no ambient
        // tenant (no JWT at all) for the query filter to compare against.
        app.MapGet("/api/catalog/{id:guid}/image", async (Guid id, AiBusinessPlatformDbContext db, CancellationToken ct) =>
        {
            var image = await db.CatalogItems.IgnoreQueryFilters().AsNoTracking()
                .Where(c => c.Id == id)
                .Select(c => new { c.ImageData, c.ImageContentType })
                .FirstOrDefaultAsync(ct);

            return image?.ImageData is null
                ? Results.NotFound()
                : Results.File(image.ImageData, image.ImageContentType ?? "application/octet-stream");
        }).AllowAnonymous();

        // Thin mapping over IOrderTools, the same functions the MCP server's
        // list_orders/get_order/mark_order_fulfilled tools call (Section 10.2/10.7's "one
        // function, multiple entry points"). `status` optionally filters to one OrderStatus
        // (case-insensitive, ignored if unrecognized rather than erroring — matches
        // /sales/summary's lenient `range` param).
        api.MapGet("/orders", async (string? status, IOrderTools orderTools, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
        {
            OrderStatus? parsedStatus = !string.IsNullOrWhiteSpace(status) && Enum.TryParse<OrderStatus>(status, true, out var s) ? s : null;
            return Results.Ok(await orderTools.ListOrdersAsync(tenantProvider.CurrentBusinessId, parsedStatus, ct));
        });

        api.MapGet("/orders/{id:guid}", async (Guid id, IOrderTools orderTools, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
        {
            try
            {
                return Results.Ok(await orderTools.GetOrderAsync(tenantProvider.CurrentBusinessId, id, ct));
            }
            catch (KeyNotFoundException)
            {
                return Results.NotFound();
            }
        });

        // FR18 (Section 6.3) — owner manually marks a Paid order as delivered/fulfilled.
        api.MapPost("/orders/{id:guid}/fulfill", async (
            Guid id, IOrderTools orderTools, ICurrentTenantProvider tenantProvider, ICurrentUserProvider userProvider, CancellationToken ct) =>
        {
            try
            {
                var result = await orderTools.MarkOrderFulfilledAsync(tenantProvider.CurrentBusinessId, id, userProvider.CurrentUserId, ct);
                return Results.Ok(result);
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        }).RequireAuthorization("Permission:ManageOrders");

        // Manually records/finalizes payment for an order that isn't Paid yet (cash, bank transfer,
        // etc. collected outside the automated gateway) — thin mapping over
        // IOrderTools.RecordManualPaymentAsync, the same function the MCP server's
        // record_order_payment tool calls.
        api.MapPost("/orders/{id:guid}/payment", async (
            Guid id, RecordPaymentRequest request, IOrderTools orderTools, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
        {
            try
            {
                var result = await orderTools.RecordManualPaymentAsync(tenantProvider.CurrentBusinessId, id, request.Provider, request.Reference, request.Amount, ct);
                return Results.Ok(result);
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(ex.Message);
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        }).RequireAuthorization("Permission:ManageOrders");

        // Corrects the payment method on an order's already-confirmed payment — thin mapping over
        // IOrderTools.UpdatePaymentProviderAsync, the same function the MCP server's
        // update_order_payment_provider tool calls.
        api.MapPatch("/orders/{id:guid}/payment", async (
            Guid id, UpdatePaymentProviderRequest request, IOrderTools orderTools, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
        {
            try
            {
                var result = await orderTools.UpdatePaymentProviderAsync(tenantProvider.CurrentBusinessId, id, request.Provider, ct);
                return Results.Ok(result);
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        }).RequireAuthorization("Permission:ManageOrders");

        // Business owner-initiated EcoCash charge — thin mapping over
        // IOrderTools.InitiateEcoCashPaymentAsync, the same function the MCP server's
        // pay_order_with_ecocash tool calls. Distinct from the customer's own self-service
        // /api/marketplace/orders/{id}/pay/ecocash — this one lets the owner charge a phone number
        // they supply (e.g. a WhatsApp order's real number, or a correction to the auto-attempt).
        api.MapPost("/orders/{id:guid}/pay/ecocash", async (
            Guid id, PayOrderWithEcoCashRequest request, IOrderTools orderTools, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.PhoneNumber))
            {
                return Results.BadRequest("phoneNumber is required.");
            }
            try
            {
                var result = await orderTools.InitiateEcoCashPaymentAsync(tenantProvider.CurrentBusinessId, id, request.PhoneNumber, ct);
                return Results.Ok(result);
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(ex.Message);
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        }).RequireAuthorization("Permission:ManageOrders");

        // Delivery tracking — assigns (or reassigns) a driver, thin mapping over
        // IDeliveryTools.AssignDriverAsync, the same function the MCP server's
        // assign_delivery_driver tool calls.
        api.MapPost("/orders/{id:guid}/delivery/driver", async (
            Guid id, AssignDriverRequest request, IDeliveryTools deliveryTools, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
        {
            try
            {
                var result = await deliveryTools.AssignDriverAsync(tenantProvider.CurrentBusinessId, id, request.DriverName, ct);
                return Results.Ok(result);
            }
            catch (KeyNotFoundException)
            {
                return Results.NotFound();
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        }).RequireAuthorization("Permission:ManageOrders");

        // Progresses a delivery's status (Pending -> Assigned -> InTransit -> Delivered), thin
        // mapping over IDeliveryTools.UpdateDeliveryStatusAsync, the same function the MCP
        // server's update_delivery_status tool calls.
        api.MapPatch("/orders/{id:guid}/delivery/status", async (
            Guid id, UpdateDeliveryStatusRequest request, IDeliveryTools deliveryTools, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
        {
            try
            {
                var result = await deliveryTools.UpdateDeliveryStatusAsync(tenantProvider.CurrentBusinessId, id, request.Status, ct);
                return Results.Ok(result);
            }
            catch (KeyNotFoundException)
            {
                return Results.NotFound();
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        }).RequireAuthorization("Permission:ManageOrders");

        // Point of Sale — records an in-person/walk-in sale that's already been paid for, thin
        // mapping over IOrderTools.RecordPosSaleAsync (the same function the MCP server's
        // record_pos_sale tool calls).
        api.MapPost("/orders/pos-sale", async (
            PosSaleRequest request, IOrderTools orderTools, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
        {
            try
            {
                var items = request.Items.Select(i => new PosSaleLineItem(i.CatalogItemId, i.Quantity)).ToList();
                var result = await orderTools.RecordPosSaleAsync(
                    tenantProvider.CurrentBusinessId, items, request.PaymentMethod, request.CustomerId, request.CustomerWhatsAppNumber, request.CustomerName,
                    request.AmountTendered, ct);
                return Results.Ok(result);
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        }).RequireAuthorization("Permission:ManageOrders");

        // Converts a customer's open quotation (Quoted order) into an Invoiced order with a
        // pending payment record — thin mapping over IOrderTools.CreateInvoiceAsync, the same
        // function the WhatsApp orchestrator's checkout flow and the MCP server's create_invoice
        // tool call.
        api.MapPost("/orders/{customerId:guid}/invoice", async (
            Guid customerId, IOrderTools orderTools, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
        {
            try
            {
                var result = await orderTools.CreateInvoiceAsync(tenantProvider.CurrentBusinessId, customerId, ct);
                return Results.Ok(result);
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        }).RequireAuthorization("Permission:ManageOrders");

        // Creates a quotation (Quoted order, no payment yet) from multiple catalog items — thin
        // mapping over IOrderTools.CreateQuotationAsync, the same function the MCP server's
        // create_quotation tool calls.
        api.MapPost("/orders/quotation", async (
            QuotationRequest request, IOrderTools orderTools, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
        {
            try
            {
                var items = request.Items.Select(i => new PosSaleLineItem(i.CatalogItemId, i.Quantity)).ToList();
                var result = await orderTools.CreateQuotationAsync(
                    tenantProvider.CurrentBusinessId, items, request.CustomerId, request.CustomerWhatsAppNumber, request.CustomerName, ct);
                return Results.Ok(result);
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        }).RequireAuthorization("Permission:ManageOrders");

        // Printable/downloadable PDF receipt for any order (POS sale, invoice, etc). Not exposed
        // as an MCP tool — MCP tools return JSON, not files — so the Assistant points the user at
        // the order to download this from, rather than emitting a PDF itself.
        api.MapGet("/orders/{id:guid}/receipt", async (
            Guid id, IDocumentGenerationTools documentTools, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
        {
            try
            {
                var pdf = await documentTools.GenerateOrderReceiptAsync(tenantProvider.CurrentBusinessId, id, ct);
                return Results.File(pdf, "application/pdf", $"receipt-{id:N}.pdf");
            }
            catch (KeyNotFoundException ex)
            {
                return Results.NotFound(ex.Message);
            }
        });

        // Lets the POS screen (and the Assistant) find an existing customer to attach to a new
        // sale instead of re-entering their details — thin mapping over
        // ICustomerTools.ListCustomersAsync, the same function the MCP server's list_customers
        // tool calls.
        api.MapGet("/customers", async (string? search, ICustomerTools customerTools, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
            Results.Ok(await customerTools.ListCustomersAsync(tenantProvider.CurrentBusinessId, search, ct)));

        // Thin mapping over IApprovalTools.ListApprovalsAsync, the same function the MCP server's
        // list_pending_approvals tool calls.
        api.MapGet("/approvals", async (IApprovalTools approvalTools, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
            Results.Ok(await approvalTools.ListApprovalsAsync(tenantProvider.CurrentBusinessId, status: null, ct)));

        // FR17 (Section 6.3) — sales summary. Thin mapping over IInsightsTools.GetSalesSummaryAsync
        // — the same function backing the Assistant chat's get_sales_summary tool and the MCP
        // server's equivalent tool (Section 10.2/10.7's "one function, multiple entry points").
        api.MapGet("/sales/summary", async (string? range, DateTimeOffset? from, DateTimeOffset? to, IInsightsTools insightsTools, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
        {
            try
            {
                var insight = await insightsTools.GetSalesSummaryAsync(tenantProvider.CurrentBusinessId, range, from, to, ct);
                var totals = insight.Totals.Select(t => new SalesCurrencyTotal(t.Currency, t.OrderCount, t.TotalAmount)).ToList();
                var trend = insight.Trend.Select(t => new SalesTrendPoint(t.Date, t.OrderCount, t.TotalAmount)).ToList();
                var topItems = insight.TopItems.Select(t => new SalesTopItem(t.CatalogItemId, t.Name, t.QuantitySold, t.Revenue)).ToList();
                return Results.Ok(new SalesSummaryResponse(insight.Range, insight.RangeStart, insight.RangeEnd, insight.TotalOrders, totals, trend, topItems));
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        }).RequireAuthorization("Permission:ViewAccounting");

        // New ground, not a spec section — supplier records + purchase orders to restock from
        // them, the "buying stock in" counterpart to the customer-facing order/POS model. Thin
        // mappings over ISupplierTools/IPurchaseOrderTools, the same functions the MCP server's
        // list_suppliers/create_supplier/list_purchase_orders/create_purchase_order/
        // receive_purchase_order tools call.
        api.MapGet("/suppliers", async (string? search, ISupplierTools supplierTools, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
            Results.Ok(await supplierTools.ListSuppliersAsync(tenantProvider.CurrentBusinessId, search, ct)));

        api.MapPost("/suppliers", async (
            CreateSupplierRequest request, ISupplierTools supplierTools, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
        {
            try
            {
                var supplier = await supplierTools.CreateSupplierAsync(
                    tenantProvider.CurrentBusinessId, request.Name, request.ContactPhone, request.Email, request.Notes, ct);
                return Results.Ok(supplier);
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        }).RequireAuthorization("Permission:ManageSuppliers");

        api.MapPatch("/suppliers/{id:guid}", async (
            Guid id, UpdateSupplierRequest request, ISupplierTools supplierTools, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
        {
            try
            {
                var supplier = await supplierTools.UpdateSupplierAsync(
                    tenantProvider.CurrentBusinessId, id, request.Name, request.ContactPhone, request.Email, request.Notes, request.Active, ct);
                return Results.Ok(supplier);
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(ex.Message);
            }
            catch (KeyNotFoundException ex)
            {
                return Results.NotFound(ex.Message);
            }
        }).RequireAuthorization("Permission:ManageSuppliers");

        api.MapGet("/purchase-orders", async (string? status, IPurchaseOrderTools purchaseOrderTools, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
        {
            PurchaseOrderStatus? parsedStatus = !string.IsNullOrWhiteSpace(status) && Enum.TryParse<PurchaseOrderStatus>(status, true, out var s) ? s : null;
            return Results.Ok(await purchaseOrderTools.ListPurchaseOrdersAsync(tenantProvider.CurrentBusinessId, parsedStatus, ct));
        });

        api.MapGet("/purchase-orders/{id:guid}", async (Guid id, IPurchaseOrderTools purchaseOrderTools, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
        {
            try
            {
                return Results.Ok(await purchaseOrderTools.GetPurchaseOrderAsync(tenantProvider.CurrentBusinessId, id, ct));
            }
            catch (KeyNotFoundException ex)
            {
                return Results.NotFound(ex.Message);
            }
        });

        api.MapPost("/purchase-orders", async (
            CreatePurchaseOrderRequest request, IPurchaseOrderTools purchaseOrderTools, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
        {
            try
            {
                var items = request.Items.Select(i => new PurchaseOrderLineItem(i.CatalogItemId, i.NewItemName, i.NewItemType, i.NewItemUnit, i.Quantity, i.UnitCost)).ToList();
                var result = await purchaseOrderTools.CreatePurchaseOrderAsync(tenantProvider.CurrentBusinessId, request.SupplierId, items, request.Currency, ct);
                return Results.Ok(result);
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        }).RequireAuthorization("Permission:ManageSuppliers");

        api.MapPost("/purchase-orders/{id:guid}/receive", async (
            Guid id, ReceivePurchaseOrderRequest? request, IPurchaseOrderTools purchaseOrderTools, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
        {
            try
            {
                var linePrices = request?.LinePrices?.Select(p => new ReceivedLinePrice(p.PurchaseOrderItemId, p.SalePrice)).ToList();
                return Results.Ok(await purchaseOrderTools.ReceivePurchaseOrderAsync(tenantProvider.CurrentBusinessId, id, linePrices, ct));
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        }).RequireAuthorization("Permission:ManageSuppliers");

        // Records a cash payment made to the supplier against a PO's outstanding balance — a
        // continuation of the existing PO lifecycle, not a distinct accounting action, so this
        // stays under the same Permission:ManageSuppliers gate as every other PO endpoint here.
        api.MapPost("/purchase-orders/{id:guid}/payment", async (
            Guid id, RecordSupplierPaymentRequest request, IPurchaseOrderTools purchaseOrderTools, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
        {
            try
            {
                var result = await purchaseOrderTools.RecordSupplierPaymentAsync(tenantProvider.CurrentBusinessId, id, request.Amount, request.Provider, ct);
                return Results.Ok(result);
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        }).RequireAuthorization("Permission:ManageSuppliers");

        // Printable/downloadable PDF for a supplier purchase order — same shared document layout
        // as the order receipt above.
        api.MapGet("/purchase-orders/{id:guid}/document", async (
            Guid id, IDocumentGenerationTools documentTools, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
        {
            try
            {
                var pdf = await documentTools.GeneratePurchaseOrderDocumentAsync(tenantProvider.CurrentBusinessId, id, ct);
                return Results.File(pdf, "application/pdf", $"purchase-order-{id:N}.pdf");
            }
            catch (KeyNotFoundException ex)
            {
                return Results.NotFound(ex.Message);
            }
        });

        // Real order-creation workflow is still out of scope for Phase 0 — orders are only ever
        // created via the AI orchestrator's reserve_stock tool today (Section 6.3).
        api.MapPost("/orders", () => Results.StatusCode(StatusCodes.Status501NotImplemented));

        // Section 10.5 — the ONLY path that can move a PendingApproval out of Pending; never the AI.
        api.MapPost("/approvals/{id:guid}/decision", async (
            Guid id, ApprovalDecisionRequest request,
            IApprovalTools approvalTools, IOrderTools orderTools, IMessagingTools messagingTools,
            ICurrentTenantProvider tenantProvider, ICurrentUserProvider userProvider,
            CancellationToken ct) =>
        {
            bool approve;
            if (string.Equals(request.Decision, "approve", StringComparison.OrdinalIgnoreCase))
            {
                approve = true;
            }
            else if (string.Equals(request.Decision, "reject", StringComparison.OrdinalIgnoreCase))
            {
                approve = false;
            }
            else
            {
                return Results.BadRequest("decision must be \"approve\" or \"reject\".");
            }

            // The decision-maker is always the authenticated caller's own id — never
            // client-supplied, since trusting a caller's claim of "who I am" isn't sound once
            // other businesses' users could plausibly call this endpoint (Section 14/15).
            var decidedBy = userProvider.CurrentUserId;

            ApprovalDecisionResult decision;
            try
            {
                decision = await approvalTools.DecideApprovalAsync(tenantProvider.CurrentBusinessId, id, approve, decidedBy, ct);
            }
            catch (InvalidOperationException ex)
            {
                return Results.NotFound(ex.Message);
            }

            // Dispatch by ActionType — only on a fresh transition, never re-run on an idempotent
            // repeat call. A single `if` is proportionate for the one sensitive action type that
            // exists today; switch to a dictionary<string, handler> registry once a 2nd is added.
            if (!decision.WasAlreadyDecided && decision.ActionType == ApprovalActionTypes.CancelPaidOrder)
            {
                var details = JsonSerializer.Deserialize<CancelPaidOrderDetails>(decision.DetailsJson)!;
                if (approve)
                {
                    await orderTools.CancelPaidOrderAsync(tenantProvider.CurrentBusinessId, details.OrderId, decidedBy, ct);
                }
                else
                {
                    await orderTools.NotifyOrderCancellationRejectedAsync(tenantProvider.CurrentBusinessId, details.OrderId, decidedBy, ct);
                }
            }
            else if (!decision.WasAlreadyDecided && decision.ActionType == ApprovalActionTypes.SendCustomerMessage)
            {
                var details = JsonSerializer.Deserialize<SendCustomerMessageDetails>(decision.DetailsJson)!;
                if (approve)
                {
                    await messagingTools.SendApprovedCustomerMessageAsync(tenantProvider.CurrentBusinessId, details.CustomerId, details.DraftedText, ct);
                }
            }
            else if (!decision.WasAlreadyDecided && decision.ActionType == ApprovalActionTypes.PaymentProofSubmitted)
            {
                var details = JsonSerializer.Deserialize<PaymentProofSubmittedDetails>(decision.DetailsJson)!;
                if (approve)
                {
                    await orderTools.ConfirmManualPaymentProofAsync(tenantProvider.CurrentBusinessId, details.OrderId, decidedBy, ct);
                }
                // On reject: leave the order Invoiced/unpaid — the customer can retry via EcoCash
                // or a fresh proof upload.
            }

            return Results.Ok(decision);
        }).RequireAuthorization("Permission:DecideApprovals");

        // The proof image itself is a private financial document (unlike the catalog-item image
        // GET, which is deliberately AllowAnonymous) — returned as base64 JSON rather than a raw
        // image response, since a bearer token can't be attached to an <Image> tag's src; fetched
        // only when the business expands a payment_proof_submitted approval card.
        api.MapGet("/payments/{paymentId:guid}/proof-image", async (
            Guid paymentId, AiBusinessPlatformDbContext db, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
        {
            var image = await db.Payments.AsNoTracking()
                .Where(p => p.Id == paymentId && p.BusinessId == tenantProvider.CurrentBusinessId)
                .Select(p => new { p.ProofImageData, p.ProofImageContentType })
                .FirstOrDefaultAsync(ct);

            if (image?.ProofImageData is null)
            {
                return Results.NotFound();
            }

            var dataUri = $"data:{image.ProofImageContentType ?? "application/octet-stream"};base64,{Convert.ToBase64String(image.ProofImageData)}";
            return Results.Ok(new { dataUri });
        }).RequireAuthorization("Permission:DecideApprovals");

        // Section 10.6/12.3 — document upload for RAG. Plain-text body only this pass, no
        // file/PDF upload parsing.
        api.MapPost("/documents", async (
            UploadDocumentRequest request, IRagTools ragTools, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Title) || string.IsNullOrWhiteSpace(request.Content))
            {
                return Results.BadRequest("title and content are required.");
            }

            var result = await ragTools.IngestDocumentAsync(tenantProvider.CurrentBusinessId, request.Title, request.SourceType ?? "text", request.Content, ct);
            return Results.Ok(result);
        }).RequireAuthorization("Permission:ManageBusinessSettings");

        // Section 12.3/19 — stand-in for Meta's real embedded-signup/OAuth onboarding flow: the
        // operator pastes in values obtained directly from Meta's own dashboard. Status is set to
        // Active immediately (confirmed) since no live verification call exists yet to flip it
        // later; a business has at most one WhatsAppConnection, so this is create-or-update.
        api.MapPost("/whatsapp/connect", async (
            WhatsAppConnectRequest request, AiBusinessPlatformDbContext db, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.WabaId) || string.IsNullOrWhiteSpace(request.PhoneNumberId) || string.IsNullOrWhiteSpace(request.SystemUserToken))
            {
                return Results.BadRequest("wabaId, phoneNumberId, and systemUserToken are required.");
            }

            var connection = await db.WhatsAppConnections
                .FirstOrDefaultAsync(c => c.BusinessId == tenantProvider.CurrentBusinessId, ct);

            if (connection is null)
            {
                connection = new WhatsAppConnection
                {
                    Id = Guid.NewGuid(),
                    BusinessId = tenantProvider.CurrentBusinessId,
                    CreatedAt = DateTimeOffset.UtcNow
                };
                db.WhatsAppConnections.Add(connection);
            }

            connection.WabaId = request.WabaId;
            connection.PhoneNumberId = request.PhoneNumberId;
            connection.SystemUserToken = request.SystemUserToken;
            connection.Status = WhatsAppConnectionStatus.Active;

            await db.SaveChangesAsync(ct);
            return Results.Ok(connection);
        }).RequireAuthorization("Permission:ManageBusinessSettings");

        // Section 13.2 — connects the business's own Paynow merchant integration. Mirrors
        // /whatsapp/connect exactly: a business has at most one PaynowConnection, so this is
        // create-or-update, active immediately (no separate Paynow-side verification step to wait for).
        api.MapPost("/payments/connect", async (
            PaynowConnectRequest request, AiBusinessPlatformDbContext db, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.IntegrationId) || string.IsNullOrWhiteSpace(request.IntegrationKey) || string.IsNullOrWhiteSpace(request.NotificationEmail))
            {
                return Results.BadRequest("integrationId, integrationKey, and notificationEmail are required.");
            }

            var connection = await db.PaynowConnections
                .FirstOrDefaultAsync(c => c.BusinessId == tenantProvider.CurrentBusinessId, ct);

            if (connection is null)
            {
                connection = new PaynowConnection
                {
                    Id = Guid.NewGuid(),
                    BusinessId = tenantProvider.CurrentBusinessId,
                    CreatedAt = DateTimeOffset.UtcNow
                };
                db.PaynowConnections.Add(connection);
            }

            connection.IntegrationId = request.IntegrationId;
            connection.IntegrationKey = request.IntegrationKey;
            connection.NotificationEmail = request.NotificationEmail;

            await db.SaveChangesAsync(ct);
            return Results.Ok(connection);
        }).RequireAuthorization("Permission:ManageBusinessSettings");

        // Real EcoCash Instant Payment sandbox integration — a genuine alternate gateway alongside
        // Paynow above, not a replacement. Mirrors /payments/connect exactly: create-or-update,
        // active immediately.
        api.MapPost("/payments/connect-ecocash", async (
            EcoCashConnectRequest request, AiBusinessPlatformDbContext db, ICurrentTenantProvider tenantProvider, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrWhiteSpace(request.Password) ||
                string.IsNullOrWhiteSpace(request.MerchantCode) || string.IsNullOrWhiteSpace(request.MerchantPin) ||
                string.IsNullOrWhiteSpace(request.MerchantNumber))
            {
                return Results.BadRequest("username, password, merchantCode, merchantPin, and merchantNumber are required.");
            }

            var connection = await db.EcoCashConnections
                .FirstOrDefaultAsync(c => c.BusinessId == tenantProvider.CurrentBusinessId, ct);

            if (connection is null)
            {
                connection = new EcoCashConnection
                {
                    Id = Guid.NewGuid(),
                    BusinessId = tenantProvider.CurrentBusinessId,
                    CreatedAt = DateTimeOffset.UtcNow
                };
                db.EcoCashConnections.Add(connection);
            }

            connection.Username = request.Username;
            connection.Password = request.Password;
            connection.MerchantCode = request.MerchantCode;
            connection.MerchantPin = request.MerchantPin;
            connection.MerchantNumber = request.MerchantNumber;
            connection.MerchantName = request.MerchantName;
            connection.SuperMerchantName = request.SuperMerchantName;
            if (!string.IsNullOrWhiteSpace(request.CountryCode)) connection.CountryCode = request.CountryCode;
            if (!string.IsNullOrWhiteSpace(request.TerminalId)) connection.TerminalId = request.TerminalId;
            if (!string.IsNullOrWhiteSpace(request.Location)) connection.Location = request.Location;

            await db.SaveChangesAsync(ct);
            return Results.Ok(connection);
        }).RequireAuthorization("Permission:ManageBusinessSettings");

        // Proof-of-wiring (Section 10.7): the exact same IHealthTool implementation the Mcp
        // project exposes as an MCP tool, called in-process here.
        api.MapGet("/health/ping", async (IHealthTool healthTool, CancellationToken ct) =>
            Results.Ok(new { message = await healthTool.PingAsync(ct) }));
    }
}
