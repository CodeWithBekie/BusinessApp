namespace AiBusinessPlatform.Application.Tools;

public record ReportDateRange(string RangeKey, DateTimeOffset? Start, DateTimeOffset? End);

// Shared by IInsightsTools.GetSalesSummaryAsync and IAccountingTools.GetProfitAndLossAsync — the
// same "range=today|7d|30d|all, or explicit from/to" convention, extracted so both reports parse
// and validate it identically rather than drifting apart.
public static class ReportDateRangeResolver
{
    public static ReportDateRange Resolve(string? range, DateTimeOffset? from, DateTimeOffset? to)
    {
        if ((from is null) != (to is null))
        {
            throw new ArgumentException("from and to must be provided together.", nameof(from));
        }
        if (from is not null && to is not null && from > to)
        {
            throw new ArgumentException("from must not be after to.", nameof(from));
        }

        var rangeKey = from is not null && to is not null
            ? "custom"
            : range?.ToLowerInvariant() switch
            {
                "today" => "today",
                "7d" => "7d",
                "all" => "all",
                _ => "30d"
            };

        DateTimeOffset? rangeStart = rangeKey switch
        {
            "custom" => from,
            "today" => new DateTimeOffset(DateTimeOffset.UtcNow.Date, TimeSpan.Zero),
            "7d" => DateTimeOffset.UtcNow.AddDays(-7),
            "all" => null,
            _ => DateTimeOffset.UtcNow.AddDays(-30)
        };
        DateTimeOffset? rangeEnd = rangeKey == "custom" ? to : null;

        return new ReportDateRange(rangeKey, rangeStart, rangeEnd);
    }
}
