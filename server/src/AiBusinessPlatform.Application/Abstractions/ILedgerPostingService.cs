using AiBusinessPlatform.Domain;

namespace AiBusinessPlatform.Application.Abstractions;

// Internal-only bookkeeping engine — not REST/MCP-exposed. Adds JournalEntry/JournalLine rows to
// the SAME DbContext instance the calling tool method already has open; callers call
// SaveChangesAsync themselves afterward (same pattern as dbContext.AuditLogs.Add throughout
// OrderTools/PurchaseOrderTools/ExpenseTools), so a posting is always atomic with the business
// state change it represents.
public interface ILedgerPostingService
{
    // Cash-basis — call exactly once, at the moment a sale's payment is confirmed.
    Task PostSaleAsync(
        Guid businessId, Guid orderId, PaymentProvider provider, decimal paymentAmount, decimal vatAmount,
        string currency, decimal costOfGoodsSold, DateTimeOffset postedAt, CancellationToken cancellationToken = default);

    // Corrects a previously-posted PostSaleAsync entry when the confirmed payment's provider
    // and/or amount is edited afterward — reverses the original cash/revenue/VAT-payable lines and
    // posts the corrected ones as one balanced JournalEntry, so Trial Balance/General Ledger/Cash
    // Flow stay consistent with the corrected Payment row (which Sales/P&L/Cash Up already read
    // live). VAT is unchanged — only provider/amount are editable on a confirmed payment. No-op if
    // nothing actually changed.
    Task PostSaleCorrectionAsync(
        Guid businessId, Guid orderId, PaymentProvider previousProvider, decimal previousAmount,
        PaymentProvider newProvider, decimal newAmount, decimal vatAmount, string currency,
        DateTimeOffset postedAt, CancellationToken cancellationToken = default);

    Task PostExpenseAsync(
        Guid businessId, Guid expenseId, ExpenseCategory category, PaymentProvider paymentMethod,
        decimal amount, string currency, DateTimeOffset postedAt, CancellationToken cancellationToken = default);

    // Accrual — Dr Inventory / Cr AccountsPayable, at goods-received time.
    Task PostPurchaseReceiptAsync(
        Guid businessId, Guid purchaseOrderId, decimal totalReceivedCost, string currency,
        DateTimeOffset postedAt, CancellationToken cancellationToken = default);

    Task PostSupplierPaymentAsync(
        Guid businessId, Guid purchaseOrderId, decimal amount, PaymentProvider provider, string currency,
        DateTimeOffset postedAt, CancellationToken cancellationToken = default);
}
