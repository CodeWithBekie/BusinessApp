using AiBusinessPlatform.Domain;

namespace AiBusinessPlatform.Application.Tools;

// Single source of truth for the fixed, standard chart of accounts every business gets lazily
// seeded with (ILedgerPostingService.EnsureChartOfAccountsAsync) — no dynamic account-creation
// UI/API. Keeps LedgerPostingService (what to post to) and AccountingTools (what counts as
// "cash" for cash-flow) from ever drifting apart.
public static class LedgerAccountCodes
{
    public const string Cash = "cash";
    public const string Bank = "bank";
    public const string MobileMoney = "mobile_money";
    public const string OtherReceipts = "other_receipts";
    public const string Inventory = "inventory";
    public const string AccountsPayable = "accounts_payable";
    public const string VatPayable = "vat_payable";
    public const string SalesRevenue = "sales_revenue";
    public const string CostOfGoodsSold = "cost_of_goods_sold";

    public static readonly IReadOnlyList<string> CashEquivalentCodes = [Cash, Bank, MobileMoney, OtherReceipts];

    public static string ExpenseAccountCode(ExpenseCategory category) => $"expense_{category.ToString().ToLowerInvariant()}";

    public static string CashEquivalentCodeFor(PaymentProvider provider) => provider switch
    {
        PaymentProvider.Cash => Cash,
        PaymentProvider.Bank => Bank,
        PaymentProvider.EcoCash => MobileMoney,
        PaymentProvider.Other => OtherReceipts,
        _ => throw new ArgumentOutOfRangeException(nameof(provider))
    };

    public static readonly IReadOnlyList<(string Code, string Name, AccountType Type)> StandardAccounts =
    [
        (Cash, "Cash", AccountType.Asset),
        (Bank, "Bank", AccountType.Asset),
        (MobileMoney, "Mobile Money", AccountType.Asset),
        (OtherReceipts, "Other Receipts", AccountType.Asset),
        (Inventory, "Inventory", AccountType.Asset),
        (AccountsPayable, "Accounts Payable", AccountType.Liability),
        (VatPayable, "VAT Payable", AccountType.Liability),
        (SalesRevenue, "Sales Revenue", AccountType.Revenue),
        (CostOfGoodsSold, "Cost of Goods Sold", AccountType.Expense),
        ("expense_rent", "Rent Expense", AccountType.Expense),
        ("expense_utilities", "Utilities Expense", AccountType.Expense),
        ("expense_wages", "Wages Expense", AccountType.Expense),
        ("expense_supplies", "Supplies Expense", AccountType.Expense),
        ("expense_transport", "Transport Expense", AccountType.Expense),
        ("expense_marketing", "Marketing Expense", AccountType.Expense),
        ("expense_other", "Other Expense", AccountType.Expense),
    ];
}
