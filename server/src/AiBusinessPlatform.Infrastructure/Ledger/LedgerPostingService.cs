using AiBusinessPlatform.Application.Abstractions;
using AiBusinessPlatform.Application.Tools;
using AiBusinessPlatform.Domain;
using AiBusinessPlatform.Domain.Entities;
using AiBusinessPlatform.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace AiBusinessPlatform.Infrastructure.Ledger;

public class LedgerPostingService(AiBusinessPlatformDbContext dbContext) : ILedgerPostingService
{
    public async Task PostSaleAsync(
        Guid businessId, Guid orderId, PaymentProvider provider, decimal paymentAmount, decimal vatAmount,
        string currency, decimal costOfGoodsSold, DateTimeOffset postedAt, CancellationToken cancellationToken = default)
    {
        var accounts = await EnsureChartOfAccountsAsync(businessId, cancellationToken);
        var revenueAmount = paymentAmount - vatAmount; // VAT-exclusive — same split GetProfitAndLossAsync already uses

        var entry = NewEntry(businessId, currency, "Sale", orderId, postedAt, $"Sale — order {orderId}");
        dbContext.JournalEntries.Add(entry);
        dbContext.JournalLines.Add(Line(businessId, entry.Id, accounts[LedgerAccountCodes.CashEquivalentCodeFor(provider)], paymentAmount, 0));
        dbContext.JournalLines.Add(Line(businessId, entry.Id, accounts[LedgerAccountCodes.SalesRevenue], 0, revenueAmount));
        if (vatAmount > 0)
        {
            dbContext.JournalLines.Add(Line(businessId, entry.Id, accounts[LedgerAccountCodes.VatPayable], 0, vatAmount));
        }

        // Separate, independently-balanced entry — not extra lines on the same entry — so a sale
        // with no known cost (a never-purchased item) simply omits it with no zero-amount noise,
        // and each JournalEntry stays a self-checking Dr==Cr unit.
        if (costOfGoodsSold > 0)
        {
            var cogsEntry = NewEntry(businessId, currency, "Sale", orderId, postedAt, $"Cost of goods sold — order {orderId}");
            dbContext.JournalEntries.Add(cogsEntry);
            dbContext.JournalLines.Add(Line(businessId, cogsEntry.Id, accounts[LedgerAccountCodes.CostOfGoodsSold], costOfGoodsSold, 0));
            dbContext.JournalLines.Add(Line(businessId, cogsEntry.Id, accounts[LedgerAccountCodes.Inventory], 0, costOfGoodsSold));
        }
    }

    public async Task PostSaleCorrectionAsync(
        Guid businessId, Guid orderId, PaymentProvider previousProvider, decimal previousAmount,
        PaymentProvider newProvider, decimal newAmount, decimal vatAmount, string currency,
        DateTimeOffset postedAt, CancellationToken cancellationToken = default)
    {
        if (previousProvider == newProvider && previousAmount == newAmount)
        {
            return;
        }

        var accounts = await EnsureChartOfAccountsAsync(businessId, cancellationToken);
        var previousRevenue = previousAmount - vatAmount;
        var newRevenue = newAmount - vatAmount;

        var entry = NewEntry(businessId, currency, "SaleCorrection", orderId, postedAt, $"Payment correction — order {orderId}");
        dbContext.JournalEntries.Add(entry);

        // Reverse the original PostSaleAsync lines (debit/credit swapped)...
        dbContext.JournalLines.Add(Line(businessId, entry.Id, accounts[LedgerAccountCodes.CashEquivalentCodeFor(previousProvider)], 0, previousAmount));
        dbContext.JournalLines.Add(Line(businessId, entry.Id, accounts[LedgerAccountCodes.SalesRevenue], previousRevenue, 0));
        if (vatAmount > 0)
        {
            dbContext.JournalLines.Add(Line(businessId, entry.Id, accounts[LedgerAccountCodes.VatPayable], vatAmount, 0));
        }

        // ...then post the corrected ones, same shape as PostSaleAsync.
        dbContext.JournalLines.Add(Line(businessId, entry.Id, accounts[LedgerAccountCodes.CashEquivalentCodeFor(newProvider)], newAmount, 0));
        dbContext.JournalLines.Add(Line(businessId, entry.Id, accounts[LedgerAccountCodes.SalesRevenue], 0, newRevenue));
        if (vatAmount > 0)
        {
            dbContext.JournalLines.Add(Line(businessId, entry.Id, accounts[LedgerAccountCodes.VatPayable], 0, vatAmount));
        }
    }

    public async Task PostExpenseAsync(
        Guid businessId, Guid expenseId, ExpenseCategory category, PaymentProvider paymentMethod,
        decimal amount, string currency, DateTimeOffset postedAt, CancellationToken cancellationToken = default)
    {
        var accounts = await EnsureChartOfAccountsAsync(businessId, cancellationToken);
        var entry = NewEntry(businessId, currency, "Expense", expenseId, postedAt, $"Expense — {category}");
        dbContext.JournalEntries.Add(entry);
        dbContext.JournalLines.Add(Line(businessId, entry.Id, accounts[LedgerAccountCodes.ExpenseAccountCode(category)], amount, 0));
        dbContext.JournalLines.Add(Line(businessId, entry.Id, accounts[LedgerAccountCodes.CashEquivalentCodeFor(paymentMethod)], 0, amount));
    }

    public async Task PostPurchaseReceiptAsync(
        Guid businessId, Guid purchaseOrderId, decimal totalReceivedCost, string currency,
        DateTimeOffset postedAt, CancellationToken cancellationToken = default)
    {
        if (totalReceivedCost <= 0)
        {
            return;
        }

        var accounts = await EnsureChartOfAccountsAsync(businessId, cancellationToken);
        var entry = NewEntry(businessId, currency, "PurchaseReceipt", purchaseOrderId, postedAt, $"Goods received — PO {purchaseOrderId}");
        dbContext.JournalEntries.Add(entry);
        dbContext.JournalLines.Add(Line(businessId, entry.Id, accounts[LedgerAccountCodes.Inventory], totalReceivedCost, 0));
        dbContext.JournalLines.Add(Line(businessId, entry.Id, accounts[LedgerAccountCodes.AccountsPayable], 0, totalReceivedCost));
    }

    public async Task PostSupplierPaymentAsync(
        Guid businessId, Guid purchaseOrderId, decimal amount, PaymentProvider provider, string currency,
        DateTimeOffset postedAt, CancellationToken cancellationToken = default)
    {
        var accounts = await EnsureChartOfAccountsAsync(businessId, cancellationToken);
        var entry = NewEntry(businessId, currency, "SupplierPayment", purchaseOrderId, postedAt, $"Supplier payment — PO {purchaseOrderId}");
        dbContext.JournalEntries.Add(entry);
        dbContext.JournalLines.Add(Line(businessId, entry.Id, accounts[LedgerAccountCodes.AccountsPayable], amount, 0));
        dbContext.JournalLines.Add(Line(businessId, entry.Id, accounts[LedgerAccountCodes.CashEquivalentCodeFor(provider)], 0, amount));
    }

    // Idempotent — only inserts whatever standard accounts this business doesn't have yet. Also
    // checks the local change-tracker (not just the DB) so multiple Post*Async calls issued
    // against the SAME DbContext instance in one request never try to add the same Code twice.
    private async Task<Dictionary<string, Guid>> EnsureChartOfAccountsAsync(Guid businessId, CancellationToken cancellationToken)
    {
        var existing = await dbContext.Accounts.AsNoTracking()
            .Where(a => a.BusinessId == businessId)
            .Select(a => new { a.Code, a.Id })
            .ToDictionaryAsync(a => a.Code, a => a.Id, cancellationToken);

        foreach (var entry in dbContext.ChangeTracker.Entries<Account>())
        {
            if (entry.State == EntityState.Added && entry.Entity.BusinessId == businessId)
            {
                existing.TryAdd(entry.Entity.Code, entry.Entity.Id);
            }
        }

        foreach (var (code, name, type) in LedgerAccountCodes.StandardAccounts)
        {
            if (existing.ContainsKey(code))
            {
                continue;
            }

            var account = new Account { Id = Guid.NewGuid(), BusinessId = businessId, Code = code, Name = name, Type = type, CreatedAt = DateTimeOffset.UtcNow };
            dbContext.Accounts.Add(account);
            existing[code] = account.Id;
        }

        return existing;
    }

    private static JournalEntry NewEntry(Guid businessId, string currency, string sourceType, Guid sourceId, DateTimeOffset postedAt, string description) => new()
    {
        Id = Guid.NewGuid(),
        BusinessId = businessId,
        Description = description,
        Currency = currency,
        SourceType = sourceType,
        SourceId = sourceId.ToString(),
        PostedAt = postedAt,
        CreatedAt = DateTimeOffset.UtcNow
    };

    private static JournalLine Line(Guid businessId, Guid journalEntryId, Guid accountId, decimal debit, decimal credit) => new()
    {
        Id = Guid.NewGuid(),
        BusinessId = businessId,
        JournalEntryId = journalEntryId,
        AccountId = accountId,
        Debit = debit,
        Credit = credit
    };
}
