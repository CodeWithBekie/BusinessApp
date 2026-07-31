using System.ComponentModel;
using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Auth;
using AiBusinessPlatform.Application.Tools;
using AiBusinessPlatform.Domain;
using ModelContextProtocol.Server;

namespace AiBusinessPlatform.Mcp.Tools;

// Section 10.7 — the same IOrderTools the dashboard calls, exposed here for external AI clients
// and the in-app Assistant. mark_order_fulfilled resolves "who did this" from the authenticated
// caller's own JWT (ICurrentUserProvider), never from the model — same rule the dashboard's own
// fulfill endpoint follows. Mutating tools call IPermissionChecker.EnsurePermission first — the
// MCP surface isn't reachable through ASP.NET Core's RequireAuthorization pipeline the REST
// endpoints use, so this is the second (and only other) enforcement point for Permission.ManageOrders.
[McpServerToolType]
public class OrderMcpTools(IOrderTools orderTools, ICurrentTenantProvider tenantProvider, ICurrentUserProvider userProvider, IPermissionChecker permissionChecker)
{
    // Nullable parameters need an explicit `= null` default — see CatalogMcpTools' remarks.
    [McpServerTool(Name = "list_orders"), Description("Lists this business's orders, most recent first, optionally filtered to one status: \"Quoted\", \"Invoiced\", \"Paid\", \"Fulfilled\", or \"Cancelled\".")]
    public Task<IReadOnlyList<OrderSummary>> ListOrders(OrderStatus? status = null, CancellationToken cancellationToken = default)
        => orderTools.ListOrdersAsync(tenantProvider.CurrentBusinessId, status, cancellationToken);

    [McpServerTool(Name = "get_order"), Description("Gets full detail for one order by its id: customer, line items, and payment status.")]
    public Task<OrderDetailSummary> GetOrder(Guid orderId, CancellationToken cancellationToken = default)
        => orderTools.GetOrderAsync(tenantProvider.CurrentBusinessId, orderId, cancellationToken);

    [McpServerTool(Name = "mark_order_fulfilled"), Description("Marks a Paid order as fulfilled/delivered. Only call this when the owner has clearly and explicitly confirmed the order should be marked fulfilled.")]
    public Task<OrderFulfillmentResult> MarkOrderFulfilled(Guid orderId, CancellationToken cancellationToken = default)
    {
        permissionChecker.EnsurePermission(Permission.ManageOrders);
        return orderTools.MarkOrderFulfilledAsync(tenantProvider.CurrentBusinessId, orderId, userProvider.CurrentUserId, cancellationToken);
    }

    [McpServerTool(Name = "record_pos_sale"), Description("Records an in-person/walk-in sale that's already been paid for (cash, card, or mobile money tapped at the counter) — creates the order, decrements stock, and marks it Paid immediately. Resolve item names to catalogItemId first (e.g. via check_catalog_availability or list_catalog_items) — never guess an id. paymentMethod must be \"Cash\", \"EcoCash\", \"Bank\", or \"Other\". If the owner names a customer, call list_customers first to check whether they've bought before and pass their existing customerId — only fall back to customerWhatsAppNumber (optionally with customerName) for a new/unrecognized customer. Omit all three customer parameters for an anonymous walk-in sale. amountTendered is only for Cash sales — if the owner mentions how much cash was handed over (e.g. \"paid with a $50\"), pass it so change due is computed; never pass it for a non-Cash paymentMethod. Only call this when the owner has clearly and explicitly described a sale that already happened.")]
    public Task<PosSaleResult> RecordPosSale(IReadOnlyList<PosSaleLineItem> items, string paymentMethod, Guid? customerId = null, string? customerWhatsAppNumber = null, string? customerName = null, decimal? amountTendered = null, CancellationToken cancellationToken = default)
    {
        permissionChecker.EnsurePermission(Permission.ManageOrders);
        return orderTools.RecordPosSaleAsync(tenantProvider.CurrentBusinessId, items, paymentMethod, customerId, customerWhatsAppNumber, customerName, amountTendered, cancellationToken);
    }

    [McpServerTool(Name = "create_invoice"), Description("Converts a customer's existing open quotation into an invoice: sums its quoted items, transitions it to Invoiced, and creates the pending payment record the customer must pay against. There must already be a Quoted order for this customer (e.g. from create_quotation) — resolve the customerId via list_customers first.")]
    public Task<InvoiceResult> CreateInvoice(Guid customerId, CancellationToken cancellationToken = default)
    {
        permissionChecker.EnsurePermission(Permission.ManageOrders);
        return orderTools.CreateInvoiceAsync(tenantProvider.CurrentBusinessId, customerId, cancellationToken);
    }

    [McpServerTool(Name = "create_quotation"), Description("Creates a quotation for a customer from one or more catalog items: reserves stock and creates (or adds to) their open Quoted order, without collecting any payment yet. Resolve item names to catalogItemId first (e.g. via check_catalog_availability or list_catalog_items) — never guess an id. If the owner names a customer, call list_customers first to check whether they've bought before and pass their existing customerId — only fall back to customerWhatsAppNumber (optionally with customerName) for a new/unrecognized customer. Omit all three customer parameters for an anonymous walk-in quotation. Call create_invoice afterward once the customer is ready to pay.")]
    public Task<QuotationResult> CreateQuotation(IReadOnlyList<PosSaleLineItem> items, Guid? customerId = null, string? customerWhatsAppNumber = null, string? customerName = null, CancellationToken cancellationToken = default)
    {
        permissionChecker.EnsurePermission(Permission.ManageOrders);
        return orderTools.CreateQuotationAsync(tenantProvider.CurrentBusinessId, items, customerId, customerWhatsAppNumber, customerName, cancellationToken);
    }

    [McpServerTool(Name = "record_order_payment"), Description("Manually records and confirms the payment for an order that isn't Paid yet — use when a customer paid by cash, bank transfer, or another method outside the automated payment gateway. Sets the provider, reference, and amount, marks the payment Confirmed, and transitions the order to Paid regardless of how the amount compares to the order total (e.g. an agreed discount or rounding adjustment) — this does not support partial/installment payments. provider must be \"Cash\", \"EcoCash\", \"Bank\", or \"Other\". amount must be greater than zero — default it to the order's totalAmount (from get_order) unless the owner states a different amount was actually collected. Resolve orderId via get_order or list_orders first — never guess an id. Fails if the order is already Paid, Fulfilled, or Cancelled.")]
    public Task<OrderDetailSummary> RecordOrderPayment(Guid orderId, PaymentProvider provider, string reference, decimal amount, CancellationToken cancellationToken = default)
    {
        permissionChecker.EnsurePermission(Permission.ManageOrders);
        return orderTools.RecordManualPaymentAsync(tenantProvider.CurrentBusinessId, orderId, provider, reference, amount, cancellationToken);
    }

    [McpServerTool(Name = "update_order_payment_provider"), Description("Corrects the payment method on an order's already-confirmed payment — e.g. it was logged as Cash but was actually a Bank transfer. provider must be \"Cash\", \"EcoCash\", \"Bank\", or \"Other\". Fails if the order has no confirmed payment yet, or is Fulfilled/Cancelled.")]
    public Task<OrderDetailSummary> UpdateOrderPaymentProvider(Guid orderId, PaymentProvider provider, CancellationToken cancellationToken = default)
    {
        permissionChecker.EnsurePermission(Permission.ManageOrders);
        return orderTools.UpdatePaymentProviderAsync(tenantProvider.CurrentBusinessId, orderId, provider, cancellationToken);
    }

    [McpServerTool(Name = "pay_order_with_ecocash"), Description("Initiates an EcoCash payment charge to the given phone number for one of this business's own Invoiced (unpaid) orders — use when the owner has the customer's EcoCash number and wants to collect payment now, or to retry with a corrected number after the automatic invoice-time attempt used the wrong one. Resolve orderId via get_order or list_orders first — never guess an id. Fails if the business has no EcoCash or Paynow gateway connected yet, or if the order isn't Invoiced. Only call when the owner has clearly and explicitly asked to charge this order.")]
    public Task<OrderDetailSummary> PayOrderWithEcoCash(Guid orderId, string customerPhoneNumber, CancellationToken cancellationToken = default)
    {
        permissionChecker.EnsurePermission(Permission.ManageOrders);
        return orderTools.InitiateEcoCashPaymentAsync(tenantProvider.CurrentBusinessId, orderId, customerPhoneNumber, cancellationToken);
    }
}
