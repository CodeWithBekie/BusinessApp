using System.ComponentModel;

namespace AiBusinessPlatform.Application.Tools;

public record CustomerSummary(Guid Id, string WhatsAppNumber, string? Name, int OrderCount, DateTimeOffset CreatedAt);

// New ground, not a spec section — supports picking an existing customer (rather than re-entering
// their details) on a new POS sale (Section/IOrderTools.RecordPosSaleAsync), shared by the
// dashboard REST endpoint and the MCP/Assistant tool (Section 10.2/10.7's "one function, multiple
// entry points").
public interface ICustomerTools
{
    [Description("Searches this business's customers by name or WhatsApp number, most recently created first. Omit search to list all. Use this to find an existing customer before recording a sale for them, instead of creating a duplicate customer record.")]
    Task<IReadOnlyList<CustomerSummary>> ListCustomersAsync(Guid businessId, string? search, CancellationToken cancellationToken = default);

    [Description("Gets one customer by id.")]
    Task<CustomerSummary> GetCustomerAsync(Guid businessId, Guid customerId, CancellationToken cancellationToken = default);
}
